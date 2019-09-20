# config_loader.py
import configparser
import os


class Config:
    """Interact with configuration variables."""

    configParser = configparser.ConfigParser()

    @classmethod
    def initialize(cls,path='project/config.ini'):
        """Start config by reading config.ini."""
        configFilePath = (os.path.join(os.getcwd(),path))
        cls.configParser.read(configFilePath)

    @classmethod
    def get_setting(cls, section, key):
        """Get section values and key from config.ini."""
        try:
            ret = cls.configParser.get(section, key)
        except:
            ret = None
        return ret

