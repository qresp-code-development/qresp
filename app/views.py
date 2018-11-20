from wtforms import Form, StringField, PasswordField, RadioField, IntegerField
from wtforms import validators


class AdminForm(Form):
    hostname = StringField('Database Hostname', [validators.Length(min=4, max=25)])
    port = IntegerField('Port No.')
    username = StringField('Username', [validators.DataRequired("Please enter username to connect to database.")])
    password = PasswordField('Password', [validators.DataRequired("Please enter password to connect to database.")])
    dbname = StringField('Database Name', [validators.DataRequired("Please enter name of database.")])
    collection = StringField('Collection', [validators.DataRequired("Please enter collection of database.")])
    isSSL = RadioField('IsSSL?', choices=[('Yes', 'Yes'), ('No', 'No')], default='No')
