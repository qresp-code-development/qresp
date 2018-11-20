from mongoengine import *


class FilterQuerySet(QuerySet):
    """ Class to filter query on mongo database
    """

    def get_unique_values(self, field):
        """ fetches list of unique collections , journal names
        :param field: field to filter on in database
        :return: list of field values
        """
        unique_values = {str(v).lower(): v for v in self.distinct(field=field)}.values()
        return unique_values

    def get_unique_names(self, field):
        """ Fetches list of unique names
        :param field: str: filters on name
        :return: list : full names
        """
        unique_values = {str(v.firstName.lower()) + " " + str(v.lastName.lower()): v.firstName + " " + v.lastName for v
                         in self.distinct(field=field)}.values()
        return unique_values
