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
                  # Detectar binario de Chrome/Chromium para modo headless en agentes CI
                  CHROME_BIN_PATH="$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)"
                  if [ -z "$CHROME_BIN_PATH" ]; then
                    echo "No se encontró google-chrome/chromium en el agente. Instálalo o define CHROME_BIN."
                    exit 1
                  fi
                  echo "Usando navegador: $CHROME_BIN_PATH"
                  HEADLESS=true CHROME_BIN="$CHROME_BIN_PATH" BASE_URL=http://springapp.local SELENIUM_REMOTE_URL= node test_guides.js
                '''
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
