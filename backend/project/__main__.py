# # -*- coding: utf-8 -*-
# For desktop version running from command line
import sys
from project import connexionapp


def main():
    port = 80
    if len(sys.argv) > 1:
        port = int(sys.argv[1])
    # Connexion 3 apps are ASGI: run() serves through uvicorn. Wrapped in
    # main() so the `qresp` console script (setup.py entry point) resolves.
    connexionapp.run(port=port)


if __name__ == "__main__":
    main()
