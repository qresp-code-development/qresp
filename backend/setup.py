from setuptools import setup,find_packages

setup(
    name='qresp',
    version='3.0.0',
    url='https://qresp.org/',
    entry_points = {
        'console_scripts': ['qresp=project.__main__:main'],
    },
    license='GNU',
    author='Samuel Taylor, Marco Govoni, Honggeun Kim, Sushant Bansal, Aditya Tanikanti, Milson Munakami',
    author_email='datadev@lists.uchicago.edu',
    description='Qresp "Curation and Exploration of Reproducible Scientific Papers" is a Python application that facilitates the organization, annotation and exploration of data presented in scientific papers. ',
    python_requires='>=3.10',
    packages=find_packages(),
    # Synced with requirements.txt on 2026-07-02 (see
    # docs/archive/modernization/dependency-audit-2026-07-02.md): only
    # packages the code actually imports, plus the WSGI/ASGI servers. Test
    # tooling lives in the `test` extra. All version caps lifted (Flask 3 /
    # Connexion 3) -- see
    # docs/archive/modernization/full-stack-modernization-report.md.
    install_requires=[
        'flask>=3',
        'werkzeug>=3',
        'connexion[flask,swagger-ui,uvicorn]>=3.3',
        'uvicorn-worker',
        'flask_cors',
        'Flask-Session',
        'mongoengine',
        'pymongo',
        'jsonschema',
        'requests',
        'requests_oauthlib',
        'lxml',
        'gunicorn',
      ],
    extras_require={
        'test': ['nose2', 'coverage', 'mongomock'],
    },
    include_package_data=True
)
