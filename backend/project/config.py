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
        """Get section values and key from config.ini.

        Environment variables prefixed with ``QRESP_`` override config.ini. This
        lets the Docker runtime inject connection settings (e.g.
        ``QRESP_MONGODB_HOST``) without editing config.ini or changing local
        behavior; when no such variable is set, behavior is unchanged.
        """
        env_val = os.environ.get('QRESP_' + key)
        if env_val:
            return env_val
        try:
            ret = cls.configParser.get(section, key)
        except:
            ret = None
        return ret

