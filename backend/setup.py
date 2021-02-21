from setuptools import setup,find_packages

setup(
    name='qresp',
    version='2.0.5',
    url='https://qresp.org/',
    entry_points = {
        'console_scripts': ['qresp=project.__main__:main'],
    },
    license='GNU',
    author='Sushant Bansal, Aditya Tanikanti, Marco Govoni',
    author_email='datadev@lists.uchicago.edu',
    description='Qresp "Curation and Exploration of Reproducible Scientific Papers" is a Python application that facilitates the organization, annotation and exploration of data presented in scientific papers. ',
    python_requires='>=3.6',
    packages=find_packages(),
    install_requires=[
        'flask_api',
        'flask',
        'flask_cors',
        'paramiko',
        'pymongo',
        'cffi',
        'flask-mongoengine',
        'Flask-Session',
        'Flask-WTF',
        'mongoengine',
        'cryptography',
        'jinja2',
        'jsonschema',
        'pyOpenSSL',
        'werkzeug',
        'itsdangerous',
        'python-dateutil',
        'expiringdict',
        'schedule',
        'wtforms',
        'flask-sitemap',
        'requests_oauthlib',
        'mongomock',
        'connexion[swagger-ui]',
        'coverage',
        'nose2',
        'lxml',
        'gunicorn'
      ],
    include_package_data=True
)
