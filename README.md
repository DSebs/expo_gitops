# App Paquetes Turisticos - GitOps - Grupo 1

## Arquitectura del Proyecto

Este proyecto está diseñado para desplegar una aplicación backend de paquetes turísticos sobre Kubernetes utilizando Minikube. La arquitectura incluye:

- **Backend**: Imagen Docker de una aplicación Spring Boot que expone una API REST.
- **Base de datos**: PostgreSQL, desplegada como StatefulSet.
- **Orquestación**: Kustomize para overlays de desarrollo, QA y producción.
- **Gestión de secretos**: SealedSecrets para el manejo seguro de credenciales.
- **Despliegue**: ArgoCD para la gestión de aplicaciones declarativas.

## Prerrequisitos

- [Kubernetes](https://kubernetes.io/) (recomendado: Minikube)
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- [Kustomize](https://kustomize.io/)
- [ArgoCD](https://argo-cd.readthedocs.io/en/stable/)
- [SealedSecrets](https://github.com/bitnami-labs/sealed-secrets)

## Instrucciones de despliegue

1. Clona el repositorio:
	```bash
	git clone https://github.com/DSebs/expo_gitops
	cd ArgoCD
	```
2. Aplica las aplicaciones de ArgoCD:
	```bash
	kubectl apply -f argocd/applications/ -n argocd
	```

## Descripción de la aplicación

La aplicación corre un backend para la gestión de paquetes turísticos. Está construida en Spring Boot y expone endpoints REST. Utiliza una base de datos PostgreSQL para persistencia de datos.

**URL del repositorio del backend:**
`https://github.com/SantiCarD/Gestion-de-paquetes-turisticos`

## Nota importante sobre los Secrets

Si tienes intenciones de correr el proyecto en local, debes modificar los archivos de Secrets, ya que los incluidos en el repositorio solo funcionarán en el cluster de origen. Adapta los valores a tu entorno local y sella los secrets con la clave publica de tu cluster antes de desplegar.

## Autores

Grupo 1 - DevOps
