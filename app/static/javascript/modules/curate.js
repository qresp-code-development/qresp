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

    $("div[data-toggle=fieldset]").each(function() {
        var $this = $(this);
            //Add new entry
        $this.find("button[data-toggle=fieldset-add-row]").click(function() {
            var target = $($(this).data("target"))
            console.log(target);
            var oldrow = target.find("#piTable tr:last");
            console.log(oldrow);
            var row = oldrow.clone(true, true);
            console.log(row);
            console.log(row.find(":input"));
            var elem_id = row.find(":input")[0].id;
            var elem_num = parseInt(elem_id.replace(/.*-(\d{1,4})-.*/m, '$1')) + 1;
            row.attr('data-id', elem_num);
            row.find(":input").each(function() {
                console.log(this);
                var id = $(this).attr('id').replace('-' + (elem_num - 1) + '-', '-' + (elem_num) + '-');
                $(this).attr('name', id).attr('id', id).val('').removeAttr("checked");
            });
            oldrow.after(row);
        }); //End add new entry

        //Remove row
        $this.find("button[data-toggle=fieldset-remove-row]").click(function() {
            console.log("here",$this.find("#piTable tr").length);
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
            console.log(target);
            var oldrow = target.find("#extraTableCharts tr:last");
            console.log(oldrow);
            var row = oldrow.clone(true, true);
            console.log(row);
            console.log(row.find(":input"));
            var elem_id = row.find(":input")[0].id;
            var elem_num = parseInt(elem_id.replace(/.*-(\d{1,4})-.*/m, '$1')) + 1;
            row.attr('data-id', elem_num);
            row.find(":input").each(function() {
                console.log(this);
                var id = $(this).attr('id').replace('-' + (elem_num - 1) + '-', '-' + (elem_num) + '-');
                $(this).attr('name', id).attr('id', id).val('').removeAttr("checked");
            });
            oldrow.after(row);
        }); //End add new entry

        //Remove row
        $this.find("button[data-toggle=fieldset-remove-row-charts]").click(function() {
            console.log("here",$this.find("#extraTableCharts tr").length);
            if($this.find("#extraTableCharts tr").length > 1) {
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
            console.log(target);
            var oldrow = target.find("#extraTableTools tr:last");
            console.log(oldrow);
            var row = oldrow.clone(true, true);
            console.log(row);
            console.log(row.find(":input"));
            var elem_id = row.find(":input")[0].id;
            var elem_num = parseInt(elem_id.replace(/.*-(\d{1,4})-.*/m, '$1')) + 1;
            row.attr('data-id', elem_num);
            row.find(":input").each(function() {
                console.log(this);
                var id = $(this).attr('id').replace('-' + (elem_num - 1) + '-', '-' + (elem_num) + '-');
                $(this).attr('name', id).attr('id', id).val('').removeAttr("checked");
            });
            oldrow.after(row);
        }); //End add new entry

        //Remove row
        $this.find("button[data-toggle=fieldset-remove-row-tools]").click(function() {
            console.log("here",$this.find("#extraTableTools tr").length);
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
            console.log(target);
            var oldrow = target.find("#extraTableScripts tr:last");
            console.log(oldrow);
            var row = oldrow.clone(true, true);
            console.log(row);
            console.log(row.find(":input"));
            var elem_id = row.find(":input")[0].id;
            var elem_num = parseInt(elem_id.replace(/.*-(\d{1,4})-.*/m, '$1')) + 1;
            row.attr('data-id', elem_num);
            row.find(":input").each(function() {
                console.log(this);
                var id = $(this).attr('id').replace('-' + (elem_num - 1) + '-', '-' + (elem_num) + '-');
                $(this).attr('name', id).attr('id', id).val('').removeAttr("checked");
            });
            oldrow.after(row);
        }); //End add new entry

        //Remove row
        $this.find("button[data-toggle=fieldset-remove-row-scripts]").click(function() {
            console.log("here",$this.find("#extraTableScripts tr").length);
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
            console.log(target);
            var oldrow = target.find("#extraTableDatasets tr:last");
            console.log(oldrow);
            var row = oldrow.clone(true, true);
            console.log(row);
            console.log(row.find(":input"));
            var elem_id = row.find(":input")[0].id;
            var elem_num = parseInt(elem_id.replace(/.*-(\d{1,4})-.*/m, '$1')) + 1;
            row.attr('data-id', elem_num);
            row.find(":input").each(function() {
                console.log(this);
                var id = $(this).attr('id').replace('-' + (elem_num - 1) + '-', '-' + (elem_num) + '-');
                $(this).attr('name', id).attr('id', id).val('').removeAttr("checked");
            });
            oldrow.after(row);
        }); //End add new entry

        //Remove row
        $this.find("button[data-toggle=fieldset-remove-row-datasets]").click(function() {
            console.log("here",$this.find("#extraTableDatasets tr").length);
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
                    console.log(data);
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
                    console.log(data);
                    toggleAlert();  // display the returned data in the console.
                    $('#ChartForm')[0].reset();
                    $("#chartbuttons tr").remove();
                    $("#chartbuttons").append("<tr></tr>")
                    $.each(data['chartList'], function( index, value ) {
                        var col = document.createElement('td');
                        var element = document.createElement('input');
                        element.type = 'button';
                        element.value = value.saveas;
                        element.id = 'btnChartSave';
                        var onclick = 'javascript: fillValues(' + JSON.stringify(value) + ', "charts");';
                        element.setAttribute('onclick',onclick);
                        element.setAttribute('class','btn btn-theme-colored btn-lg m-0');
                        element.setAttribute('style','font-weight: bold');
                        col.append(element);
                        $('#chartbuttons tr:first').append(col);
                    });
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
                    console.log(data);
                    toggleAlert();  // display the returned data in the console.
                    $('#ToolForm')[0].reset();
                    $("#toolbuttons tr").remove();
                    $("#toolbuttons").append("<tr></tr>")
                    $.each(data['toolList'], function( index, value ) {
                        var col = document.createElement('td');
                        var element = document.createElement('input');
                        element.type = 'button';
                        element.value = value.saveas;
                        element.id = 'btnToolSave';
                        var onclick = 'javascript: fillValues(' + JSON.stringify(value) + ', "tools");';
                        element.setAttribute('onclick',onclick);
                        element.setAttribute('class','btn btn-theme-colored btn-lg m-0');
                        element.setAttribute('style','font-weight: bold');
                        col.append(element);
                        $('#toolbuttons tr:first').append(col);
                    });
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
                    console.log(data);
                    toggleAlert();  // display the returned data in the console.
                    $('#DatasetForm')[0].reset();
                    $("#datasetbuttons tr").remove();
                    $("#datasetbuttons").append("<tr></tr>")
                    $.each(data['datasetList'], function( index, value ) {
                        var col = document.createElement('td');
                        var element = document.createElement('input');
                        element.type = 'button';
                        element.value = value.saveas;
                        element.id = 'btnDatasetSave';
                        var onclick = 'javascript: fillValues(' + JSON.stringify(value) + ', "datasets");';
                        element.setAttribute('onclick',onclick);
                        element.setAttribute('class','btn btn-theme-colored btn-lg m-0');
                        element.setAttribute('style','font-weight: bold');
                        col.append(element);
                        $('#datasetbuttons tr:first').append(col);
                    });
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
                    console.log(data);
                    toggleAlert();  // display the returned data in the console.
                    $('#ScriptForm')[0].reset();
                    $("#scriptbuttons tr").remove();
                    $("#scriptbuttons").append("<tr></tr>")
                    $.each(data['scriptList'], function( index, value ) {
                        var col = document.createElement('td');
                        var element = document.createElement('input');
                        element.type = 'button';
                        element.value = value.saveas;
                        element.id = 'btnScriptSave';
                        var onclick = 'javascript: fillValues(' + JSON.stringify(value) + ', "scripts");';
                        element.setAttribute('onclick',onclick);
                        element.setAttribute('class','btn btn-theme-colored btn-lg m-0');
                        element.setAttribute('style','font-weight: bold');
                        col.append(element);
                        $('#scriptbuttons tr:first').append(col);
                    });
                }
            });
            e.preventDefault(); // block the traditional submission of the form.
    });

});

function fillValues(obj,type) {
    if(type === 'charts') {
        $('form[name="charts"] input[name=kind][value="' + obj.kind + '"]').prop('checked', true);
        $('form[name="charts"] #caption').val(obj.caption);
        $('form[name="charts"] #number').val(obj.number);
        $('form[name="charts"] #files').val(obj.files);
        $('form[name="charts"] #imageFile').val(obj.imageFile);
        $('form[name="charts"] #notebookFile').val(obj.notebookFile);
        $('form[name="charts"] #properties').val(obj.properties);
        $('form[name="charts"] #saveas').val(obj.saveas);
        $.each(obj.extraFields, function( index, value ) {
            $('#extraFields-'+index+'-extrakey').val(value[index].extrakey);
            $('#extraFields-'+index+'-extravalue').val(value[index].extravalue);
        });
    }
    else if(type === 'tools') {
        $('form[name="tools"] input[name=kind][value="' + obj.kind + '"]').prop('checked', true);
        $('form[name="tools"] #packageName').val(obj.packageName);
        $('form[name="tools"] #URLs').val(obj.URLs);
        $('form[name="tools"] #version').val(obj.version);
        $('form[name="tools"] #programName').val(obj.programName);
        $('form[name="tools"] #patches').val(obj.patches);
        $('form[name="tools"] #description').val(obj.description);
        $('form[name="tools"] #facilityName').val(obj.facilityName);
        $('form[name="tools"] #measurement').val(obj.measurement);
        $('form[name="tools"] #saveas').val(obj.saveas);
        $.each(obj.extraFields, function( index, value ) {
            $('#extraFields-'+index+'-extrakey').val(value[index].extrakey);
            $('#extraFields-'+index+'-extravalue').val(value[index].extravalue);
        });
    }
     else if(type === 'datasets') {
        $('#files').val(obj.files);
        $('#readme').val(obj.readme);
        $('#URLs').val(obj.URLs);
        $('#saveas').val(obj.saveas);
        $.each(obj.extraFields, function( index, value ) {
            $('#extraFields-'+index+'-extrakey').val(value[index].extrakey);
            $('#extraFields-'+index+'-extravalue').val(value[index].extravalue);
        });
    }
     else if(type === 'scripts') {
        $('#files').val(obj.files);
        $('#readme').val(obj.readme);
        $('#URLs').val(obj.URLs);
        $('#saveas').val(obj.saveas);
        $.each(obj.extraFields, function( index, value ) {
            $('#extraFields-'+index+'-extrakey').val(value[index].extrakey);
            $('#extraFields-'+index+'-extravalue').val(value[index].extravalue);
        });
    }
}

