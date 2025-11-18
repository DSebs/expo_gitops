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
                sh """
                    echo "Aplicando Applications en ArgoCD..."
                    kubectl apply -f argocd/applications/ -n ${ARGO_NS}
                """
            }
        }

        stage('Wait for Synchronization') {
            steps {
                script {
                    sh """
                        echo "Esperando a que las aplicaciones estén listas..."

                        # Espera a que ArgoCD reporte apps healthy
                        until kubectl get applications -n ${ARGO_NS} | grep -E "Healthy"; do
                          echo "Esperando que ArgoCD sincronice..."
                          sleep 5
                        done
                    """
                }
            }
        }

        stage('Wait for Readiness') {
            steps {
                sh """
                  echo "Esperando a que los pods estén corriendo..."
                  kubectl wait --for=condition=ready pod -l app=backend -n dev --timeout=90s
                  kubectl wait --for=condition=ready pod -l app=db -n dev --timeout=90s
                """
            }
        }

        stage('Functional API Tests') {
            steps {
                sh """
                    echo "Ejecutando pruebas Postman..."
                    newman run ${POSTMAN_COLLECTION} \
                      --env-var minikubeIp=${MINIKUBE_IP}
                """
            }
        }

        stage('Performance Tests') {
            environment {
                JMETER_VERSION = "5.6.3"
                JMETER_HOME = "tools/apache-jmeter-${JMETER_VERSION}"
            }
            steps {
                sh """
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
                  REPORT_DIR=\"jmeter/results/html-${BUILD_NUMBER}\"
                  rm -rf \"\$REPORT_DIR\" || true
                  ${JMETER_HOME}/bin/jmeter -g jmeter/results/results.jtl -o \"\$REPORT_DIR\"
                """
                archiveArtifacts artifacts: 'jmeter/results/results.jtl', fingerprint: true
                archiveArtifacts artifacts: "jmeter/results/html-${env.BUILD_NUMBER}/**", fingerprint: true
            }
        }

        stage('UI Functional Tests') {
            when {
                expression { return sh(script: "docker info >/dev/null 2>&1 && echo ok || echo no", returnStdout: true).trim() == "ok" }
            }
            steps {
                sh """
                  set -e
                  echo "Levantando Selenium Standalone Chrome..."
                  docker rm -f selenium-standalone || true
                  docker pull selenium/standalone-chrome:latest
                  docker run -d --name selenium-standalone -p 4444:4444 --add-host springapp.local:${MINIKUBE_IP} selenium/standalone-chrome:latest
                  echo "Esperando a que Selenium esté listo..."
                  READY=0
                  for i in $(seq 1 60); do
                    RESP=$(curl -fsS http://localhost:4444/status || true)
                    echo "Intento $i: $RESP" || true
                    echo "$RESP" | grep -q '\\\"ready\\\"[[:space:]]*:[[:space:]]*true' && READY=1 && break
                    sleep 2
                  done
                  if [ "$READY" -ne 1 ]; then
                    echo "Selenium no estuvo listo a tiempo"
                    docker logs selenium-standalone || true
                    exit 1
                  fi
                  echo "Ejecutando pruebas Selenium..."
                  docker pull node:18-bullseye
                  docker run --rm --network host -e BASE_URL=http://springapp.local -v "$PWD/tests/selenium":/tests -w /tests node:18-bullseye bash -lc "
                    set -e
                    npm install --no-audit --no-fund
                    node test_guides.js
                  "
                  echo "Apagando Selenium..."
                  docker rm -f selenium-standalone || true
                """
            }
        }

        stage('Teardown') {
            steps {
                sh """
                    echo "Destruyendo entornos..."
                    kubectl delete -f argocd/applications/ -n ${ARGO_NS} --ignore-not-found=true
                """
            }
        }

    }
}
