pipeline {
    agent any

    environment {
        KUBECONFIG = "/var/lib/jenkins/.kube/config"
        ARGO_NS = "argocd"
        POSTMAN_COLLECTION = "postman/test_collection.json"
        MINIKUBE_IP = "192.168.49.2"
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Deploy Infrastructure') {
            steps {
                sh '''
                    echo "Aplicando Applications en ArgoCD..."
                    # Resolver IP actual de Minikube (evitar valores estáticos)
                    MINIKUBE_IP=$(minikube ip || true)
                    echo "MINIKUBE_IP=${MINIKUBE_IP}"
                    if [ -z "$MINIKUBE_IP" ]; then
                      echo "Minikube no responde. Intenta iniciar o verificar el nodo del agente."
                      exit 1
                    fi
                    # Asegurar kube-context apuntando al API server correcto
                    kubectl config set-cluster minikube --server="https://${MINIKUBE_IP}:8443" >/dev/null 2>&1 || true
                    kubectl config use-context minikube >/dev/null 2>&1 || true
                    # Crear namespace de ArgoCD si no existe
                    kubectl get ns $ARGO_NS >/dev/null 2>&1 || kubectl create ns $ARGO_NS
                    # Aplicar manifests
                    kubectl apply -f argocd/applications/ -n $ARGO_NS
                '''
            }
        }

        stage('Wait for Synchronization') {
            steps {
                script {
                    sh '''
                        echo "Esperando a que las aplicaciones estén listas..."

                        # Espera a que ArgoCD reporte apps healthy
                        until kubectl get applications -n $ARGO_NS | grep -E "Healthy"; do
                          echo "Esperando que ArgoCD sincronice..."
                          sleep 5
                        done
                    '''
                }
            }
        }

        stage('Wait for Readiness') {
            steps {
                sh '''
                  echo "Esperando a que los pods estén corriendo..."
                  kubectl wait --for=condition=ready pod -l app=backend -n dev --timeout=90s
                  kubectl wait --for=condition=ready pod -l app=db -n dev --timeout=90s
                '''
            }
        }

        stage('Functional API Tests') {
            steps {
                sh '''
                    echo "Ejecutando pruebas Postman..."
                    newman run $POSTMAN_COLLECTION \
                      --env-var minikubeIp=$MINIKUBE_IP
                '''
            }
        }

        stage('Performance Tests') {
            environment {
                JMETER_VERSION = "5.6.3"
                JMETER_HOME = "tools/apache-jmeter-${JMETER_VERSION}"
            }
            steps {
                sh '''
                  set -e
                  echo "Descargando Apache JMeter ${JMETER_VERSION} si no está presente..."
                  mkdir -p tools
                  if [ ! -d "${JMETER_HOME}" ]; then
                    curl -fsSL https://downloads.apache.org/jmeter/binaries/apache-jmeter-${JMETER_VERSION}.tgz -o tools/jmeter.tgz
                    tar -xzf tools/jmeter.tgz -C tools
                  fi
                  echo "Ejecutando pruebas JMeter (smoke)..."
                  mkdir -p jmeter/results
                  # limpiar resultado previo si existe para evitar conflictos
                  rm -f jmeter/results/results.jtl || true
                  ${JMETER_HOME}/bin/jmeter -n -t jmeter/tests/backend_smoke.jmx -l jmeter/results/results.jtl -JminikubeIp=${MINIKUBE_IP} -f
                  echo "Generando reporte HTML..."
                  REPORT_DIR="jmeter/results/html-${BUILD_NUMBER}"
                  rm -rf "$REPORT_DIR" || true
                  ${JMETER_HOME}/bin/jmeter -g jmeter/results/results.jtl -o "$REPORT_DIR"
                '''
                archiveArtifacts artifacts: 'jmeter/results/results.jtl', fingerprint: true
                archiveArtifacts artifacts: "jmeter/results/html-${env.BUILD_NUMBER}/**", fingerprint: true
                script {
                  try {
                    publishHTML target: [
                      reportDir: "jmeter/results/html-${env.BUILD_NUMBER}",
                      reportFiles: 'index.html',
                      reportName: 'JMeter Report',
                      keepAll: true,
                      alwaysLinkToLastBuild: true,
                      allowMissing: false
                    ]
                  } catch (err) {
                    echo "publishHTML no disponible o plugin ausente: ${err}"
                  }
                }
            }
        }

        stage('UI Functional Tests') {
            steps {
                sh '''
                  set -e
                  echo "Ejecutando pruebas Selenium localmente (sin contenedores)..."
                  node -v
                  npm -v
                  # Chrome/Chromium recomendado; Selenium Manager puede gestionar el driver en versiones recientes
                  (google-chrome --version || chromium --version || true) || true
                  # Ejecutar pruebas
                  cd tests/selenium
                  npm install --no-audit --no-fund
                  # Detectar binario de Chrome/Chromium
                  CHROME_BIN_PATH="$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)"
                  if [ -z "$CHROME_BIN_PATH" ]; then
                    echo "No se encontró google-chrome/chromium en el agente. Instálalo o define CHROME_BIN."
                    exit 1
                  fi
                  echo "Usando navegador: $CHROME_BIN_PATH"
                  rm -rf screenshots && mkdir -p screenshots
                  # Si existe xvfb-run, ejecuta con display virtual visible; si no, ejecuta en headless pero generando screenshots igualmente
                  if command -v xvfb-run >/dev/null 2>&1; then
                    echo "Ejecutando con Xvfb (display virtual visible)..."
                    xvfb-run -a -s "-screen 0 1920x1080x24" bash -lc 'HEADLESS=false CHROME_BIN="$CHROME_BIN_PATH" BASE_URL=http://springapp.local SELENIUM_REMOTE_URL= node test_guides.js'
                  else
                    echo "xvfb-run no disponible; ejecutando en modo headless (capturas igualmente habilitadas)..."
                    HEADLESS=true CHROME_BIN="$CHROME_BIN_PATH" BASE_URL=http://springapp.local SELENIUM_REMOTE_URL= node test_guides.js
                  fi
                '''
                archiveArtifacts artifacts: 'tests/selenium/screenshots/**', fingerprint: true, onlyIfSuccessful: false
            }
        }

        stage('Teardown') {
            steps {
                sh '''
                    echo "Destruyendo entornos..."
                    kubectl delete -f argocd/applications/ -n $ARGO_NS --ignore-not-found=true
                '''
            }
        }

    }
}
