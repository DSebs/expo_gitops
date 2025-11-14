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
                      --env-var baseUrl=http://${MINIKUBE_IP}
                """
            }
        }

    }

    post {
        always {
            echo "Destruyendo entornos..."

            sh """
                kubectl delete -f argocd/applications/ -n ${ARGO_NS} --ignore-not-found=true
            """
        }
    }
}
