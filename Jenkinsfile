pipeline {
    agent any

    environment {
        KUBECONFIG = "/var/lib/jenkins/.kube/config"
        ARGO_NS = "argocd"
        POSTMAN_COLLECTION = "postman/test_collection.json"
        MINIKUBE_IP = "192.168.49.2"
    }

    stages {

        stage('Checkout CI/CD Repo') {
            steps {
                checkout scm
            }
        }

        stage('Deploy Infra with ArgoCD Applications') {
            steps {
                sh """
                    echo "Aplicando Applications en ArgoCD..."
                    kubectl apply -f argocd/applications/ -n ${ARGO_NS}
                """
            }
        }

        stage('Wait for ArgoCD Sync') {
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

        stage('Wait for Pods Ready') {
            steps {
                sh """
                  echo "Esperando a que los pods estén corriendo..."
                  kubectl wait --for=condition=ready pod -l app=backend -n dev --timeout=90s
                  kubectl wait --for=condition=ready pod -l app=db -n dev --timeout=90s
                """
            }
        }

        stage('Run Postman Tests') {
            steps {
                sh """
                    echo "Ejecutando pruebas Postman..."
                    newman run ${POSTMAN_COLLECTION} \
                      --env-var minikubeIp=${MINIKUBE_IP}
                """
            }
        }

        stage('Non-Functional Tests (JMeter)') {
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
                  ${JMETER_HOME}/bin/jmeter -n -t jmeter/tests/backend_smoke.jmx -l jmeter/results/results.jtl -JminikubeIp=${MINIKUBE_IP}
                  echo "Generando reporte HTML..."
                  ${JMETER_HOME}/bin/jmeter -g jmeter/results/results.jtl -o jmeter/results/html
                """
                archiveArtifacts artifacts: 'jmeter/results/results.jtl', fingerprint: true
                archiveArtifacts artifacts: 'jmeter/results/html/**', fingerprint: true
            }
        }

        stage('Destroy Environments') {
            steps {
                sh """
                    echo "Destruyendo entornos..."
                    kubectl delete -f argocd/applications/ -n ${ARGO_NS} --ignore-not-found=true
                """
            }
        }

    }
}
