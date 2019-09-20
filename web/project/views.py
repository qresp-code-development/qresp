from wtforms import Form, StringField, PasswordField, RadioField, HiddenField, FieldList, FormField, BooleanField, DateTimeField, TextAreaField, SelectField
from wtforms import validators
from wtforms.fields.html5 import EmailField,IntegerField
from wtforms.validators import DataRequired, Optional

class RequiredIf(DataRequired):
    """Validator which makes a field required if another field is set and has a truthy value.

    Sources:
        - http://wtforms.simplecodes.com/docs/1.0.1/validators.html
        - http://stackoverflow.com/questions/8463209/how-to-make-a-field-conditionally-optional-in-wtforms
        - https://gist.github.com/devxoul/7638142#file-wtf_required_if-py
    """
    field_flags = ('requiredif',)

    def __init__(self, message=None, *args, **kwargs):
        super(RequiredIf).__init__()
        self.message = message
        self.conditions = kwargs

    # field is requiring that name field in the form is data value in the form
    def __call__(self, form, field):
        for name, data in self.conditions.items():
            other_field = form[name]
            if other_field is None:
                raise Exception('no field named "%s" in form' % name)
            if other_field.data == data and not field.data:
                DataRequired.__call__(self, form, field)
            Optional()(form, field)

class PassCodeForm(Form):
    passcode = PasswordField('Passcode',[validators.DataRequired()],description='Enter passcode to change mongo database details')

class AdminForm(Form):
    hostname = StringField('Database Hostname', [validators.DataRequired("Please enter Hostname of the mongo database.")],description='Hostname of the mongo database',render_kw={"placeholder": "Enter hostname to connect to database"})
    port = IntegerField('Port No.',description='Port No of database',render_kw={"placeholder": "Enter port number to connect to database"})
    username = StringField('Username', [validators.DataRequired("Please enter username to connect to database.")],description='Authorized user name to connect database',render_kw={"placeholder": "Enter username to connect to database"})
    password = PasswordField('Password', [validators.DataRequired("Please enter password to connect to database.")],description='Password to connect to database',render_kw={"placeholder": "Enter password to connect to database "})
    dbname = StringField('Database Name', [validators.DataRequired("Please enter name of database.")],description='Name of mongo database',render_kw={"placeholder": "Enter name of mongo database"})
    collection = StringField('Collection', [validators.DataRequired("Please enter collection of database.")],description='Collection of mongo database',render_kw={"placeholder": "Enter collection of database"})
    isSSL = RadioField('IsSSL?', choices=[('Yes', 'Yes'), ('No', 'No')], default='No',description='Is database SSL protected?')

class ConfigForm(Form):
    httpService = RadioField('Is there a HTTP service running on the server?', choices=[('Yes', 'Yes'), ('No', 'No')], default='No', description='e.g. https://notebook.rcc.uchicago.edu/files')
    gitService = RadioField('Is there a Git service running on the server?',choices=[('Yes', 'Yes'), ('No', 'No')], default='No')
    globusService = RadioField('Is there a Globus service running on the server?',choices=[('Yes', 'Yes'), ('No', 'No')], default='No',description='e.g. https://www.globus.org/app/transfer?origin_id=72277ed4-1ad3-11e7-bbe1-22000b9a448b&origin_path=')
    downloadPath = StringField('Download Path',description='The Globus service allows to download the paper content using gridFTP.')
    fileServerPath = StringField('File Server Path', description='If a HTTP service is running on the server, a URL may be associated to the paper content. This URL is only required by Qresp | Exploration to view images & download files using a web browser.')

class QrespServerForm(Form):
    serverList = FieldList(StringField(description='Select the Address of the Database. Qresp automatically inserts the metadata file in the database'))


class NameForm(Form):
    firstName = StringField(validators=[validators.DataRequired()],description='e.g. John',render_kw={"placeholder": "Enter first name"})
    middleName = StringField(description='e.g. L.',render_kw={"placeholder": "Enter middle name"})
    lastName = StringField(validators=[validators.DataRequired()], description='e.g. Doe',render_kw={"placeholder": "Enter last name"})

class DetailsForm(Form):
    firstName = StringField('First Name',validators=[validators.DataRequired()],description='e.g. John',render_kw={"placeholder": "Enter first name"})
    middleName = StringField('Middle Name',description='e.g. L.',render_kw={"placeholder": "Enter middle name"})
    lastName = StringField('Last Name',validators=[validators.DataRequired()], description='e.g. Doe',render_kw={"placeholder": "Enter last name"})
    emailId = EmailField('Email Address', description='e.g. john.doe@company.com',render_kw={"placeholder": "Enter your email address"})
    affiliation = StringField('Affiliation', description='e.g. Department of Chem, University of XYZ',render_kw={"placeholder": "Enter your university"})

class ServerForm(Form):
    kind = RadioField('Kind', choices=[('HTTP', 'HTTP Connection'), ('Zenodo', 'Zenodo'), ('Other','Other')], default='HTTP',description='Select connection type')
    hostUrl = SelectField('Host Url',choices=[], validators = [RequiredIf(kind='HTTP Connection')], description='Select url of remote server where paper content is organized and located e.g. https://notebook.rcc.uchicago.edu/files/')
    zenodoUrl = StringField('Zenodo', description='e.g. https://www.zenodo.org/record/1234567',render_kw={"placeholder": "Enter zenodo preview url to parse data"})
    other = StringField('Other', description='e.g. http://xyz.com/files',render_kw={"placeholder": "Enter url to parse data"})

class ProjectForm(Form):
    downloadPath = HiddenField()
    fileServerPath = StringField('File Server Path', [validators.DataRequired()], description='e.g. https://notebook.rcc.uchicago.edu/files/jacs6b',render_kw={"placeholder": "The absolute path to the paper"})
    notebookPath = HiddenField()
    ProjectName = HiddenField()
    gitPath = HiddenField()
    insertedBy = FormField(DetailsForm)
    isPublic = BooleanField(default=True)
    timeStamp = DateTimeField()
    notebookFile = HiddenField()
    doi = HiddenField()

class InfoForm(Form):
    PIs = FieldList(FormField(NameForm), label='Principal Investigator(s)', description='Enter PI(s)', min_entries=1, validators=[validators.DataRequired()])
    collections = StringField(label='PaperStack',validators = [validators.DataRequired("Please enter keywords")], description='Enter name(s) defining group of papers (e.g. according to source of fundings)',render_kw={"placeholder": "Enter collection to which project belongs"})
    tags = StringField(label='Keywords',validators = [validators.DataRequired("Please enter keywords")], description='Enter Keyword(s) (e.g: DFT, organic materials, charge transfer): they facilitate paper searches using Qresp | Explorer',render_kw={"placeholder": "Enter tags for the project"})
    notebookFile = StringField('Main Notebook File', description='Enter name of a notebook file, this file may serve as a table of contents and may contain links to all datasets, charts, scripts, tools and documentation. Use the Paper Content icon (on the top) to fill this field',render_kw={"placeholder": "Enter main notebook filename"})
    doi = StringField('DOI',description='DOI minted by Qresp',render_kw={'readonly': True})

class ExtraForm(Form):
    extrakey = StringField(description='Enter custom label',render_kw={"placeholder": "Enter Field Label"})
    extravalue = StringField(description='Enter custom value', render_kw={"placeholder": "Enter Field Value"})

class ChartForm(Form):
    id = StringField('Id',render_kw={"style":"display:none;"})
    caption = StringField('Caption',[validators.DataRequired("Please enter caption")], description='Enter chart caption',render_kw={"placeholder": "Enter chart caption"})
    number = StringField('Number',[validators.DataRequired("Please enter number")], description='Enter chart number',render_kw={"placeholder": "Enter chart number"})
    files = StringField(label='Files', description='Enter file name(s) containing the data displayed in the chart (e.g. a file in CSV format). Use the Paper Content icon (on the top) to fill this field',render_kw={"placeholder": "Enter file names used to construct Chart"})
    imageFile = StringField('Image File', [validators.DataRequired("Please enter image file")], description='Enter the file name containing a snapshot of the chart. Use the Paper Content icon (on the top) to fill this field. Allowed formats are: jpg, jpeg, gif, png',render_kw={"placeholder": "Enter Image file name"})
    notebookFile = StringField('Notebook File', description='Enter the name of the notebook file used to generate the chart. Use the Paper Content icon (on the top) to fill this field. Allowed format is ipynb',render_kw={"placeholder": "Enter Notebook file"})
    properties = StringField(label='Keywords',validators= [validators.DataRequired("Please enter properties")], description='Enter keyword(s) for the content displayed in the chart. e.g. potential energy surface, band gap',render_kw={"placeholder": "Enter Keywords"})
    # saveas = StringField('Save As', [validators.DataRequired()], description='Enter a name to identify the chart', render_kw={"placeholder": "Save Chart as"})
    extraFields = FieldList(FormField(ExtraForm), label='Extra Fields', description='Enter a label name and add a value to it',min_entries=1,id='extraChartFields')

class ToolForm(Form):
    id = StringField('Id',render_kw={"style":"display:none;"})
    kind = RadioField('Kind', choices=[('software', 'Software'), ('experiment', 'Experiment')], default='software',description='Select Software or Experiment')
    packageName = StringField('Package Name', validators = [RequiredIf(kind='Software')], description='Enter name of the package (e.g. WEST)',render_kw={"placeholder": "Enter Package name for software tools"})
    URLs = StringField(label='URLs', description='Enter link(s) to package official website (e.g. www.west-code.org) or facility (e.g. www.aps.anl.gov)',render_kw={"placeholder": "Enter Urls for software tools"})
    version = StringField('Version',  validators = [RequiredIf(kind='Software')], description='Enter version number (e.g. 3.0.0) of the package',render_kw={"placeholder": "Enter version for software tools"})
    programName = StringField('Executable Name', description='Enter name of the executable (e.g. wstat.x) of the package',render_kw={"placeholder": "Enter Program name for software tools"})
    patches = StringField(label='Patches', description='Enter file name(s) containing the patches of publicly available or versioned software, customized by the user to generate some of the datasets. Use the Paper Content icon (on the top) to fill this field. (e.g. Tools/modified_wstat.txt)',render_kw={"placeholder": "Enter files for software tool"})
    description = StringField('Description', description='Enter a summary of the modifications, if any, made to the executable', render_kw={"placeholder": "Enter Description for script added to the Software Tool"})
    facilityName = StringField('Facility Name',  validators = [RequiredIf(kind='Experiment')], description='Enter name of the facility where the experiment was conducted (e.g. Argonne Advanced Photon Source)', render_kw={"placeholder": "Enter Facility name for experiment tools"})
    measurement = StringField('Measurement',  validators = [RequiredIf(kind='Experiment')], description='Enter type of measurement (e.g. soft X-ray Photoemission)', render_kw={"placeholder": "Enter measurement for experiment tools"})
    extraFields = FieldList(FormField(ExtraForm), label='Extra Fields', description='Enter a label name and add a value to it',min_entries=1,id='extraToolFields')

class DatasetForm(Form):
    id = StringField('Id',render_kw={"style":"display:none;"})
    files = StringField(label='Files', validators = [validators.DataRequired()], description='Enter file name(s) to identify the dataset. Use the Paper Content icon (on the top) to fill this field (e.g. Data/dataset.dat). If you list a folder name, all documents of the folder belong to the dataset',render_kw={"placeholder": "Enter files for dataset"})
    readme = StringField('Description', [validators.DataRequired()], description='Enter a summary about the content of the dataset',render_kw={"placeholder": "Enter descriptions For dataset"})
    URLs = StringField(label='URLs', description='Enter link(s) to the URL of the dataset, if available',render_kw={"placeholder": "Enter Urls for dataset"})
    extraFields = FieldList(FormField(ExtraForm), label='Extra Fields', description='Enter a label name and add a value to it',min_entries=1,id='extraDatasetFields')

class ScriptForm(Form):
    id = StringField('Id',render_kw={"style":"display:none;"})
    files = StringField(label='Files', validators = [validators.DataRequired()], description='Enter file names to identify the script. Use the Paper Content icon (on the top) to fill this field (e.g. Script/scriptA.py). If you list a folder name, all documents of the folder belong to the script',render_kw={"placeholder": "Enter files for script"})
    readme = StringField('Description', [validators.DataRequired()], description='Enter a summary about the content of the script',render_kw={"placeholder": "Enter description for script"})
    URLs = StringField(label='URLs', description='Enter link(s) to the URL of the script, if available',render_kw={"placeholder": "Enter Urls for script"})
    extraFields = FieldList(FormField(ExtraForm), label='Extra Fields', description='Enter a label name and add a value to it',min_entries=1,id='extraScriptFields')

class JournalForm(Form):
    abbrevName = StringField('Abbreviation',description='Enter short Journal Name')
    fullName = StringField('Journal Name',description='Enter full Journal Name',render_kw={"placeholder": "Enter full journal name"})


class ReferenceForm(Form):
    kind = RadioField('Kind', choices=[('preprint', 'Preprint'), ('journal', 'Journal'), ('dissertation','Dissertation')], default='journal',description='Select Preprint, Journal or Dissertation')
    DOI = StringField('DOI', [validators.DataRequired()], description='Enter DOI of paper (e.g. 10.1021/jacs.6b00225) if published', render_kw={"placeholder": "Enter DOI of paper"})
    authors = FieldList(FormField(NameForm),label='Authors', validators = [validators.DataRequired()], description='Enter authors of paper', render_kw={"placeholder": "Enter authors"},min_entries=1)
    title = StringField('Title', [validators.DataRequired()], description='Enter title of paper', render_kw={"placeholder": "Enter title"})
    journal = FormField(JournalForm)
    page = StringField('Page', [validators.DataRequired()], description='Enter page number of journal', render_kw={"placeholder": "Enter page number"})
    publishedAbstract = TextAreaField('Abstract', [validators.DataRequired()], description='Enter abstract', render_kw={"placeholder": "Enter abstract"})
    volume = StringField('Volume', [validators.DataRequired()], description='Enter volume of journal', render_kw={"placeholder": "Enter volume number"})
    year = IntegerField('Year', [validators.DataRequired()], description='Enter year', render_kw={"placeholder": "Enter year"})
    URLs = StringField(label='URLs', description='Enter link(s) of the paper',render_kw={"placeholder": "Enter paper Urls"})
    school = StringField('School', description='Enter name of school where dissertation was presented', render_kw={"placeholder": "Enter name of school"})

class DocumentationForm(Form):
    readme = TextAreaField('Readme',description='Enter additional documentation about paper', render_kw={"placeholder": "Enter additional documentation for paper","rows": 10, "cols": 11})

class WorkflowForm(Form):
    edges = FieldList(FieldList(StringField()))
    nodes = FieldList(StringField())

class VersionsForm(Form):
    versions = FieldList(StringField())

class HeadForm(Form):
    id = HiddenField('Id')
    readme = StringField('Description',description='Describe your external resource', render_kw={"placeholder": "Describe external resource"})
    URLs = StringField('URLs',description='Enter URLs for the external resource')

class PublishForm(Form):
    server = SelectField('Qresp Server',choices=[], validators=[validators.DataRequired()],description='Select the Address of the Database. Qresp automatically inserts the metadata file in the database')
    emailId = EmailField('Email Address', validators = [validators.DataRequired()],description='e.g. john.doe@gmail.com',render_kw={"placeholder": "Enter a Google based email address to verify your identity."})

class PaperForm(Form):
    PIs = FieldList(FormField(NameForm))
    charts = FieldList(FormField(ChartForm))
    collections = FieldList(StringField())
    datasets = FieldList(FormField(DatasetForm))
    info = FormField(ProjectForm)
    reference = FormField(ReferenceForm)
    scripts = FieldList(FormField(ScriptForm))
    tools = FieldList(FormField(ToolForm))
    tags = FieldList(StringField())
    versions = FieldList(FormField(VersionsForm))
    documentation = FormField(DocumentationForm)
    workflow = FormField(WorkflowForm)
    heads = FieldList(FormField(HeadForm))
    schema = StringField()
    version = IntegerField()






