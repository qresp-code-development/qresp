import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from sys import stderr

from project.config import Config


class Mail:
    '''
    Class to help in sending emails from qresp
    '''

    def __init__(self, config):
        '''
        Mail Helper Class

        Parameters
        -----------
        config: Config(dict)
                The configuration object for the instance
        '''

        self.fromEmail = config.get_setting('GLOBAL', 'FROM_ADDR')
        self.pwd = config.get_setting('SECRETS', 'MAIL_PWD')
        self.port = config.get_setting('GLOBAL', 'SMTP_PORT')
        self.server = config.get_setting('GLOBAL', 'SMTP_SERVER')
        self.context = ssl.create_default_context()

    def connect(self):
        '''
        Connect to the server
        Needs to be called before send email
        '''

        try:
            self.client = smtplib.SMTP(self.server, self.port)
            self.client.ehlo()
            self.client.starttls(context=self.context)
            self.client.login(self.fromEmail, self.pwd)
        except Exception as e:
            print('Error Connecting to Mail Server', file=stderr)
            print(e, file=stderr)

    def disconnect(self):
        '''
        Disconnect SMTP 
        '''
        self.client.quit()

    def send(self, subject, text, html, to):
        '''
        Send the email using the class

        Parameters
        ----------
        subject: string
                 The subject string to be sent in the email

        text: string
              The text body of the email to be sent

        html: string, optional
              HTML part of email to make hyperlink or else. 

        to: string
            Email address of the recipient
        '''
        message = MIMEMultipart('alternative')
        message['From'] = self.fromEmail
        message['To'] = to
        message['Subject'] = subject

        message.attach(MIMEText(text, 'plain'))
        message.attach(MIMEText(html, 'html'))

        # Creating a session for each time is unnecessary and hit the performance.
        # But for now, with low usage it's okay. # FUTURE
        self.connect()
        self.client.sendmail(self.fromEmail, to, message.as_string())
        self.disconnect()


mailClient = Mail(Config)
