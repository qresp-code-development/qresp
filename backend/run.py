from project import connexionapp

if __name__ == "__main__":
    # Connexion 3 apps are ASGI: run() serves through uvicorn, including the
    # validation/swagger-ui middleware (a bare Flask dev server would skip it).
    connexionapp.run(host='0.0.0.0', port=80)
