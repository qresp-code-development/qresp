from project import app

if __name__ == "__main__":
    # Flask Auto-Reload
    app.jinja_env.auto_reload = True
    app.run(host='0.0.0.0',port=80, debug=True)


