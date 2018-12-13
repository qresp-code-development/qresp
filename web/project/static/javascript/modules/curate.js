$(function () {

    $("#navbar>li.is-active").removeClass("is-active");
    $("#detailsid").addClass("is-complete");
	$("#welcomeid").addClass("is-complete");
	$("#serverid").addClass("is-complete");
	$("#projectid").addClass("is-complete");
	$("#curateid").addClass("is-active");

    $('#curatelist').change(function () {
        $('.dropdown-container').hide();
        $('#' + $(this).val()).show();
    });
    $('.repeat').each(function() {
		$(this).repeatable_fields();
	});

    //TREE

function getFormData(formdata){
    var unindexed_array = formdata;
    var indexed_array = {};
    $.map(unindexed_array, function(n, i){
        indexed_array[n['name']] = n['value'];
    });
    return indexed_array;
}

    var treedata = $('.tree-form').serializeArray();
    var searchdata = getFormData(treedata);


$.ajax({
	method: 'POST',
	url: '/getTreeInfo',
	dataType: "json",
    async:"false",
	contentType: "application/json ; charset=utf-8",
	data: JSON.stringify(searchdata),
	success: function (data) {
		$("#tree").fancytree({
			checkbox: true,
			selectMode: 3,
			persist: {
				expandLazy: false,
				overrideSource: false,
				store: "cookie", // force using cookies!
			},
			source: data.listObjects,
			lazyLoad: function (event, data) {
			    var treedata = $('.tree-form').serializeArray();
                var searchdata = {};
                var node = data.node;
                searchdata["folderAbsolutePath"] = node.key;
				data.result = $.ajax({
					url: '/getTreeInfo',
					method: 'POST',
					dataType: "json",
					contentType: "application/json ; charset=utf-8",
					data: JSON.stringify(searchdata),
					cache: false,
					success: function (resp) {
						node.addChildren(resp.listObjects);
						node.fixSelection3AfterClick();
						node.toggleExpanded();
					}
				});
			},

			select: function (event, data) {
				// Get a list of all selected nodes, and convert to a key array:
				var selKeys = $.map(data.tree.getSelectedNodes(), function (node) {
					return node.key;
				});
				$("#echoSelection3").text(selKeys.join(", "));
				// Get a list of all selected TOP nodes
				var selRootNodes = data.tree.getSelectedNodes(true);
				// ... and convert to a key array:
				var selRootKeys = $.map(selRootNodes, function (node) {
					return node.key;
				});
				$("#echoSelectionRootKeys3").text(selRootKeys.join(", "));
				$("#echoSelectionRoots3").text(selRootNodes.join(", "));
			},
			dblclick: function (event, data) {
				data.node.toggleSelected();
			},
			keydown: function (event, data) {
				if (event.which === 32) {
					data.node.toggleSelected();
					return false;
				}
			},
		});
	},
	failure: function (errMsg) {
		alert(JSON.stringify(errMsg.toString()));
	}
});
$("#btnToggleSelect").click(function () {
	$("#tree").fancytree("getRootNode").visit(function (node) {
		node.toggleSelected();
	});
	return false;
});
$("#btnDeselectAll").click(function () {
	$("#tree").fancytree("getTree").visit(function (node) {
		node.setSelected(false);
	});
	return false;
});
$("#btnSelectAll").click(function () {
	$("#tree").fancytree("getTree").visit(function (node) {
		node.setSelected(true);
	});
	return false;
});

$('input[type=text]').bind("keyup focusin", function () {
    $('#tree').addClass('disabledtree');
});

//copy from tree
$('form[name="info"] #mainnotebookfile').bind("keyup focusin", function () {
	$('#tree').removeClass('disabledtree');
	var values = []
	$("#tree").fancytree("getTree").visit(function (node) {
		if (node.selected) {
			if (node.folder != "true") {
				var keypath = node.key;
				var path = keypath.substring(keypath.indexOf(projectName) + projectName.length + 1);
				values.push(path);
				var copiedcontent = values.slice();
				$('form[name="info"] #mainnotebookfile').val(copiedcontent);
			}
		}
	});
	$("#tree").fancytree("getTree").visit(function (node) {
		node.setSelected(false);
	});
});

$('form[name="charts"] #imageFile').bind("keyup focusin", function () {
	$('#tree').removeClass('disabledtree');
	var values = []
	$("#tree").fancytree("getTree").visit(function (node) {
		if (node.selected) {
			if (node.folder != "true") {
				var keypath = node.key;
				var path = keypath.substring(keypath.indexOf(projectName) + projectName.length + 1);
				values.push(path);
				var copiedcontent = values.slice();
				$('form[name="charts"] #imageFile').val(copiedcontent);
			}
		}
	});
	$("#tree").fancytree("getTree").visit(function (node) {
		node.setSelected(false);
	});
});

$('form[name="charts"] #files').bind("keyup focusin", function () {
	$('#tree').removeClass('disabledtree');
	var values = []
	$("#tree").fancytree("getTree").visit(function (node) {
		if (node.selected) {
			if (node.folder != "true") {
				var keypath = node.key;
				var path = keypath.substring(keypath.indexOf(projectName) + projectName.length + 1);
				values.push(path);
				var copiedcontent = values.slice();
				$('form[name="charts"] #files').val(copiedcontent);
			}
		}
	});
	$("#tree").fancytree("getTree").visit(function (node) {
		node.setSelected(false);
	});
});

$('form[name="charts"] #notebookFile').bind("keyup focusin", function () {
	$('#tree').removeClass('disabledtree');
	var values = []
	$("#tree").fancytree("getTree").visit(function (node) {
		if (node.selected) {
			if (node.folder != "true") {
				var keypath = node.key;
				var path = keypath.substring(keypath.indexOf(projectName) + projectName.length + 1);
				values.push(path);
				var copiedcontent = values.slice();
				$('form[name="charts"] #notebookFile').val(copiedcontent);
			}
		}
	});
	$("#tree").fancytree("getTree").visit(function (node) {
		node.setSelected(false);
	});
});

$('form[name="tools"] #patches').bind("keyup focusin", function () {
	$('#tree').removeClass('disabledtree');
	var values = []
	$("#tree").fancytree("getTree").visit(function (node) {
		if (node.selected) {
			if (node.folder != "true") {
				var keypath = node.key;
				var path = keypath.substring(keypath.indexOf(projectName) + projectName.length + 1);
				values.push(path);
				var copiedcontent = values.slice();
				$('form[name="tools"] #patches').val(copiedcontent);
			}
		}
	});
	$("#tree").fancytree("getTree").visit(function (node) {
		node.setSelected(false);
	});
});


$('form[name="datasets"] #files').bind("keyup focusin", function () {
	$('#tree').removeClass('disabledtree');
	var values = []
	$("#tree").fancytree("getTree").visit(function (node) {
		if (node.selected) {
			if (node.folder != "true") {
				var keypath = node.key;
				var path = keypath.substring(keypath.indexOf(projectName) + projectName.length + 1);
				values.push(path);
				var copiedcontent = values.slice();
				$('form[name="datasets"] #files').val(copiedcontent);
			}
		}
	});
	$("#tree").fancytree("getTree").visit(function (node) {
		node.setSelected(false);
	});
});

$('form[name="scripts"] #files').bind("keyup focusin", function () {
	$('#tree').removeClass('disabledtree');
	var values = []
	$("#tree").fancytree("getTree").visit(function (node) {
		if (node.selected) {
			if (node.folder != "true") {
				var keypath = node.key;
				var path = keypath.substring(keypath.indexOf(projectName) + projectName.length + 1);
				values.push(path);
				var copiedcontent = values.slice();
				$('form[name="scripts"] #files').val(copiedcontent);
			}
		}
	});
	$("#tree").fancytree("getTree").visit(function (node) {
		node.setSelected(false);
	});
});

$(".disabler").bind("keyup focusin", function () {
	$('#tree').fancytree('getTree').visit(function (node) {
		node.setSelected(false);
	});
	$('#tree').addClass('disabledtree');
});

    $("div[data-toggle=fieldset]").each(function() {
        var $this = $(this);
            //Add new entry
        $this.find("button[data-toggle=fieldset-add-row]").click(function() {
            var target = $($(this).data("target"))
            var oldrow = target.find("#piTable tr:last");
            var row = oldrow.clone(true, true);
            var elem_id = row.find(":input")[0].id;
            var elem_num = parseInt(elem_id.replace(/.*-(\d{1,4})-.*/m, '$1')) + 1;
            row.attr('data-id', elem_num);
            row.find(":input").each(function() {
                var id = $(this).attr('id').replace('-' + (elem_num - 1) + '-', '-' + (elem_num) + '-');
                $(this).attr('name', id).attr('id', id).val('').removeAttr("checked");
            });
            oldrow.after(row);
        }); //End add new entry

        //Remove row
        $this.find("button[data-toggle=fieldset-remove-row]").click(function() {
            if($this.find("#piTable tr").length > 1) {
                var thisRow = $(this).closest("tr");
                thisRow.remove();
            }
        }); //End remove row

        });

    $("div[data-toggle=fieldset-charts]").each(function() {
        var $this = $(this);
            //Add new entry
        $this.find("button[data-toggle=fieldset-add-row-charts]").click(function() {
            var target = $($(this).data("target"))
            var oldrow = target.find("#extraTableCharts tr:last");
            var row = oldrow.clone(true, true);
            var elem_id = row.find(":input")[0].id;
            var elem_num = parseInt(elem_id.replace(/.*-(\d{1,4})-.*/m, '$1')) + 1;
            row.attr('data-id', elem_num);
            row.find(":input").each(function() {
                var id = $(this).attr('id').replace('-' + (elem_num - 1) + '-', '-' + (elem_num) + '-');
                $(this).attr('name', id).attr('id', id).val('').removeAttr("checked");
            });
            oldrow.after(row);
        }); //End add new entry

        //Remove row
        $this.find("button[data-toggle=fieldset-remove-row-charts]").click(function() {
            if($this.find("#extraTableCharts tr").length > 1) {
                var thisRow = $(this).closest("tr");
                thisRow.remove();
            }
        }); //End remove row

        });

    $("div[data-toggle=author-fieldset-toggle]").each(function() {
        var $this = $(this);
            //Add new entry
        $this.find("button[data-toggle=fieldset-add-row-author]").click(function() {
            var target = $($(this).data("target"))
            var oldrow = target.find("#authorTable tr:last");
            var row = oldrow.clone(true, true);
            var elem_id = row.find(":input")[0].id;
            var elem_num = parseInt(elem_id.replace(/.*-(\d{1,4})-.*/m, '$1')) + 1;
            row.attr('data-id', elem_num);
            row.find(":input").each(function() {
                var id = $(this).attr('id').replace('-' + (elem_num - 1) + '-', '-' + (elem_num) + '-');
                $(this).attr('name', id).attr('id', id).val('').removeAttr("checked");
            });
            oldrow.after(row);
        }); //End add new entry

        //Remove row
        $this.find("button[data-toggle=fieldset-remove-row-authors]").click(function() {
            if($this.find("#authorTable tr").length > 1) {
                var thisRow = $(this).closest("tr");
                thisRow.remove();
            }
        }); //End remove row

        });

    //tools extra
     $("div[data-toggle=fieldset-tools]").each(function() {
        var $this = $(this);
            //Add new entry
        $this.find("button[data-toggle=fieldset-add-row-tools]").click(function() {
            var target = $($(this).data("target"))
            var oldrow = target.find("#extraTableTools tr:last");
            var row = oldrow.clone(true, true);
            var elem_id = row.find(":input")[0].id;
            var elem_num = parseInt(elem_id.replace(/.*-(\d{1,4})-.*/m, '$1')) + 1;
            row.attr('data-id', elem_num);
            row.find(":input").each(function() {
                var id = $(this).attr('id').replace('-' + (elem_num - 1) + '-', '-' + (elem_num) + '-');
                $(this).attr('name', id).attr('id', id).val('').removeAttr("checked");
            });
            oldrow.after(row);
        }); //End add new entry

        //Remove row
        $this.find("button[data-toggle=fieldset-remove-row-tools]").click(function() {
            if($this.find("#extraTableTools tr").length > 1) {
                var thisRow = $(this).closest("tr");
                thisRow.remove();
            }
        }); //End remove row

        });

    //scripts extra
     $("div[data-toggle=fieldset-scripts]").each(function() {
        var $this = $(this);
            //Add new entry
        $this.find("button[data-toggle=fieldset-add-row-scripts]").click(function() {
            var target = $($(this).data("target"))
            var oldrow = target.find("#extraTableScripts tr:last");
            var row = oldrow.clone(true, true);
            var elem_id = row.find(":input")[0].id;
            var elem_num = parseInt(elem_id.replace(/.*-(\d{1,4})-.*/m, '$1')) + 1;
            row.attr('data-id', elem_num);
            row.find(":input").each(function() {
                var id = $(this).attr('id').replace('-' + (elem_num - 1) + '-', '-' + (elem_num) + '-');
                $(this).attr('name', id).attr('id', id).val('').removeAttr("checked");
            });
            oldrow.after(row);
        }); //End add new entry

        //Remove row
        $this.find("button[data-toggle=fieldset-remove-row-scripts]").click(function() {
           if($this.find("#extraTableScripts tr").length > 1) {
                var thisRow = $(this).closest("tr");
                thisRow.remove();
            }
        }); //End remove row

        });

         //datasets extra
     $("div[data-toggle=fieldset-datasets]").each(function() {
        var $this = $(this);
            //Add new entry
        $this.find("button[data-toggle=fieldset-add-row-datasets]").click(function() {
            var target = $($(this).data("target"))
            var oldrow = target.find("#extraTableDatasets tr:last");
            var row = oldrow.clone(true, true);
            var elem_id = row.find(":input")[0].id;
            var elem_num = parseInt(elem_id.replace(/.*-(\d{1,4})-.*/m, '$1')) + 1;
            row.attr('data-id', elem_num);
            row.find(":input").each(function() {
                var id = $(this).attr('id').replace('-' + (elem_num - 1) + '-', '-' + (elem_num) + '-');
                $(this).attr('name', id).attr('id', id).val('').removeAttr("checked");
            });
            oldrow.after(row);
        }); //End add new entry

        //Remove row
        $this.find("button[data-toggle=fieldset-remove-row-datasets]").click(function() {
            if($this.find("#extraTableDatasets tr").length > 1) {
                var thisRow = $(this).closest("tr");
                thisRow.remove();
            }
        }); //End remove row

        });




        function toggleAlert(){
            $(".alert-success").toggleClass('fade in');
            return false; // Keep close.bs.alert event from removing from DOM
        }

        function toggleAlertError(){
            $(".alert-danger").toggleClass('fade in');
            return false; // Keep close.bs.alert event from removing from DOM
        }

        $('#bsalert').on('close.bs.alert', toggleAlert)

    // Inject our CSRF token into our AJAX request.
        $.ajaxSetup({
            beforeSend: function(xhr, settings) {
                if (!/^(GET|HEAD|OPTIONS|TRACE)$/i.test(settings.type) && !this.crossDomain) {
                    xhr.setRequestHeader("X-CSRFToken", "{{ form.csrf_token._value() }}")
                }
            }
        })

    // Info
    $('#InfoForm').submit(function (e) {
        var url = "info";
         $.ajax({
                type: "POST",
                url: url,
                data: $('#InfoForm').serialize(), // serializes the form's elements.
                success: function (data) {
                    toggleAlert();  // display the returned data in the console.
                }
            });
            e.preventDefault(); // block the traditional submission of the form.
        });

    // Charts
    $('#ChartForm').submit(function (e) {
        var url = "charts";
         $.ajax({
                type: "POST",
                url: url,
                data: $('#ChartForm').serialize(), // serializes the form's elements.
                success: function (data) {
                    toggleAlert();  // display the returned data in the console.
                    createChartList(data['chartList']);
                }
            });
            e.preventDefault(); // block the traditional submission of the form.
    });


    //Tools
     $('form[name="tools"] input[name=kind]').on( "change", function() {
         var test = $(this).val();
         $('form[name="tools"] .toolClass').hide();
         $('form[name="tools"] #'+test).show();
    });

    $('#ToolForm').submit(function (e) {
        var url = "tools";
         $.ajax({
                type: "POST",
                url: url,
                data: $('#ToolForm').serialize(), // serializes the form's elements.
                success: function (data) {
                    if("errors" in data){
                        toggleAlertError();
                    }else {
                        toggleAlert();  // display the returned data in the console.
                        createToolList(data['toolList']);
                    }
                }
            });
            e.preventDefault(); // block the traditional submission of the form.
    });

    //Datasets
    $('#DatasetForm').submit(function (e) {
        var url = "datasets";
         $.ajax({
                type: "POST",
                url: url,
                data: $('#DatasetForm').serialize(), // serializes the form's elements.
                success: function (data) {
                    toggleAlert();  // display the returned data in the console.
                    createDatasetList(data['datasetList']);
                }
            });
            e.preventDefault(); // block the traditional submission of the form.
    });

    //scripts
    $('#ScriptForm').submit(function (e) {
        var url = "scripts";
         $.ajax({
                type: "POST",
                url: url,
                data: $('#ScriptForm').serialize(), // serializes the form's elements.
                success: function (data) {
                    toggleAlert();  // display the returned data in the console.
                    createScriptList(data['scriptList']);
                }
            });
            e.preventDefault(); // block the traditional submission of the form.
    });

    $('#ReferenceForm').submit(function (e) {
        var url = "reference";
         $.ajax({
                type: "POST",
                url: url,
                data: $('#ReferenceForm').serialize(), // serializes the form's elements.
                success: function (data) {
                    toggleAlert();  // display the returned data in the console.
                }
            });
            e.preventDefault(); // block the traditional submission of the form.
        });

    $('#DocumentationForm').submit(function (e) {
        var url = "documentation";
         $.ajax({
                type: "POST",
                url: url,
                data: $('#DocumentationForm').serialize(), // serializes the form's elements.
                success: function (data) {
                    toggleAlert();  // display the returned data in the console.
                }
            });
            e.preventDefault(); // block the traditional submission of the form.
        });

    });

function fillValues(obj,type) {
    if(type === 'charts') {
        $('form[name="charts"] #caption').val(obj.caption);
        $('form[name="charts"] #number').val(obj.number);
        $('form[name="charts"] #files').val(obj.files);
        $('form[name="charts"] #imageFile').val(obj.imageFile);
        $('form[name="charts"] #notebookFile').val(obj.notebookFile);
        $('form[name="charts"] #properties').val(obj.properties);
        $('form[name="charts"] #saveas').val(obj.saveas);
        $.each(obj.extraChartFields, function( index, value ) {
            $('#extraChartFields-'+index+'-extrakey').val(value.extrakey);
            $('#extraChartFields-'+index+'-extravalue').val(value.extravalue);
        });
    }
    else if(type === 'tools') {
        $('form[name="tools"] input[name=kind][value="' + obj.kind + '"]').prop('checked', true).change();
        $('form[name="tools"] #packageName').val(obj.packageName);
        $('form[name="tools"] #URLs').val(obj.URLs);
        $('form[name="tools"] #version').val(obj.version);
        $('form[name="tools"] #programName').val(obj.programName);
        $('form[name="tools"] #patches').val(obj.patches);
        $('form[name="tools"] #description').val(obj.description);
        $('form[name="tools"] #facilityName').val(obj.facilityName);
        $('form[name="tools"] #measurement').val(obj.measurement);
        $('form[name="tools"] #saveas').val(obj.saveas);
        $.each(obj.extraToolFields, function( index, value ) {
            $('#extraToolFields-'+index+'-extrakey').val(value.extrakey);
            $('#extraToolFields-'+index+'-extravalue').val(value.extravalue);
        });
    }
     else if(type === 'datasets') {
        $('form[name="datasets"] #files').val(obj.files);
        $('form[name="datasets"] #readme').val(obj.readme);
        $('form[name="datasets"] #URLs').val(obj.URLs);
        $('form[name="datasets"] #saveas').val(obj.saveas);
        $.each(obj.extraDatasetFields, function( index, value ) {
            $('#extraDatasetFields-'+index+'-extrakey').val(value.extrakey);
            $('#extraDatasetFields-'+index+'-extravalue').val(value.extravalue);
        });
    }
     else if(type === 'scripts') {
        $('form[name="scripts"] #files').val(obj.files);
        $('form[name="scripts"] #readme').val(obj.readme);
        $('form[name="scripts"] #URLs').val(obj.URLs);
        $('form[name="scripts"] #saveas').val(obj.saveas);
        $.each(obj.extraScriptFields, function( index, value ) {
            $('#extraScriptFields-'+index+'-extrakey').val(value.extrakey);
            $('#extraScriptFields-'+index+'-extravalue').val(value.extravalue);
        });
    }
    else if(type === 'reference') {
        $('form[name="reference"] input[name=kind][value="' + obj.kind + '"]').prop('checked', true).change();
        $('form[name="reference"] #DOI').val(obj.DOI);
        $('form[name="reference"] #title').val(obj.title);
        $('form[name="reference"] #journal').val(obj.journal.fullName);
        $.each(obj.authors, function( index, value ) {
            $("div[data-toggle=author-fieldset-toggle]").each(function() {
                var $this = $(this);
                //Add new entry
                if(value.firstName) {
                    $this.find("button[data-toggle=fieldset-add-row-author]").trigger('click');
                }
            });
        });
        $.each(obj.authors, function( index, value ) {
            $('#authors-' + index + '-firstName').val(value.firstName);
            $('#authors-' + index + '-middleName').val(value.middleName);
            $('#authors-' + index + '-lastName').val(value.lastName);
        });
        $('form[name="reference"] #URLs').val(obj.URLs);
        $('form[name="reference"] #school').val(obj.school);
        $('form[name="reference"] #year').val(obj.year);
        $('form[name="reference"] #volume').val(obj.volume);
        $('form[name="reference"] #publishedAbstract').val(obj.publishedAbstract);
        $('form[name="reference"] #page').val(obj.page);

    }
}

    function createChartList(data){
        $('#ChartForm')[0].reset();
        $("#chartbuttons div").remove();
        var col = document.createElement('div');
        col.setAttribute('class','form-group row');
        $("#chartbuttons").append(col);
        $.each(data, function( index, value ) {
            var element = document.createElement('input');
            element.type = 'button';
            if(value.saveas) {
                element.value = value.saveas;
            }
            else{
                element.value = value.id;
            }
            element.id = 'btnChartFetch';
            var onclick = 'javascript: fillValues(' + JSON.stringify(value) + ', "charts");';
            element.setAttribute('onclick',onclick);
            element.setAttribute('class','btn btn-theme-colored btn-lg m-1');
            element.setAttribute('style','font-weight: bold');
            col.append(element);
            $('#chartbuttons div:first').append(col);
        });
    }

    function createToolList(data){
        $('#ToolForm')[0].reset();
        $("#toolbuttons div").remove();
        var col = document.createElement('div');
        col.setAttribute('class','form-group row');
        $("#toolbuttons").append(col);
        $.each(data, function( index, value ) {
            var element = document.createElement('input');
            element.type = 'button';
            if(value.saveas) {
                element.value = value.saveas;
            }
            else{
                element.value = value.id;
            }
            element.id = 'btnToolFetch';
            var onclick = 'javascript: fillValues(' + JSON.stringify(value) + ', "tools");';
            element.setAttribute('onclick',onclick);
            element.setAttribute('class','btn btn-theme-colored btn-lg m-1');
            element.setAttribute('style','font-weight: bold');
            col.append(element);
            $('#toolbuttons div:first').append(col);
        });
        $('form[name="tools"] input[name=kind][value="software"]').prop('checked', true).change();
    }

    function createDatasetList(data){
           $('#DatasetForm')[0].reset();
            $("#datasetbuttons div").remove();
             var col = document.createElement('div');
            col.setAttribute('class','form-group row');
            $("#datasetbuttons").append(col);
            $.each(data, function( index, value ) {
                var element = document.createElement('input');
                element.type = 'button';
                if(value.saveas) {
                    element.value = value.saveas;
                }
                else{
                    element.value = value.id;
                }
                element.id = 'btnDatasetFetch';
                var onclick = 'javascript: fillValues(' + JSON.stringify(value) + ', "datasets");';
                element.setAttribute('onclick',onclick);
                element.setAttribute('class','btn btn-theme-colored btn-lg m-1');
                element.setAttribute('style','font-weight: bold');
                col.append(element);
                $('#datasetbuttons div:first').append(col);
            });
    }

     function createScriptList(data){
           $('#ScriptForm')[0].reset();
            $("#scriptbuttons div").remove();
            var col = document.createElement('div');
            col.setAttribute('class','form-group row');
            $("#scriptbuttons").append(col);
            $.each(data, function( index, value ) {
                var element = document.createElement('input');
                element.type = 'button';
                if(value.saveas) {
                    element.value = value.saveas;
                }
                else{
                    element.value = value.id;
                }
                element.id = 'btnScriptFetch';
                var onclick = 'javascript: fillValues(' + JSON.stringify(value) + ', "scripts");';
                element.setAttribute('onclick',onclick);
                element.setAttribute('class','btn btn-theme-colored btn-lg m-1');
                element.setAttribute('style','font-weight: bold');
                col.append(element);
                $('#scriptbuttons div:first').append(col);
            });
    }
    
    function fetchDOI(doi) {
        $.ajax({
                type: "POST",
                url: "/fetchReferenceDOI",
                data: JSON.stringify({"doi":doi}), // serializes the form's elements.
                contentType: "application/json; charset=utf-8",
                dataType: "json",
                success: function (data) {
                    if("errors" in data){
                        console.log("recheck your DOI");
                    }else {
                        fillValues(data['fetchDOI'], "reference"); // display the returned data in the console.
                    }
                }
        });
    }