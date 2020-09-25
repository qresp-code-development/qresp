$(function(){

    // parses uploaded data
    $('input[type=file]').change(function (event) {
        $('#customfileupload').html($(this).val().replace("C:\\fakepath\\", ""));
        var reader = new FileReader();
        reader.onload = onReaderLoad;
        reader.readAsText(event.target.files[0]);
    });

    $('#btnParse').on('click', function() {
        $.ajax({
            type: "POST",
            url: "/uploadFile",
            data: JSON.stringify($("#myTextArea").val()),
            contentType: "application/json",
            success: function (data) {
                if ("error" in data) {
                    bootbox.alert("Unable to process JSON "+ str(data.error));
                } else {
                    window.location.href = "qrespcurator";
                }
            },
            error: function (xhr, status, error) {
                var errorMessage = xhr.status + ': ' + xhr.statusText;
                bootbox.alert("Unable to process JSON "+ str(errorMessage));
            }
        });
    });



    // closes alerts
    $("[data-hide]").on("click", function(){
        $(this).closest("." + $(this).attr("data-hide")).hide();
    });
    // Details form
    $('#detailsform').submit(function (e) {
        $.ajax({
            type: "POST",
            url: "details",
            data: $('#detailsform').serialize(), // serializes the form's elements.
            success: function (data) {
                buildCuratorTable(data.data);
            },
            error: function(xhr, status, error) {
                var errorMessage = xhr.status + ': ' + xhr.statusText + ': '+xhr.responseText;
                $("#warning").toggle();
                $("#warning-message").html(errorMessage);
            }
        });
        e.preventDefault(); // block the traditional submission of the form.
    });

    //server form
    $('#serverform').submit(function (e) {
        $.ajax({
            type: "POST",
            url: "server",
            data: $('#serverform').serialize(), // serializes the form's elements.
            success: function (data) {
                $('#treeServerModal').modal('show');
                if(data.data['kind'].includes("HTTP")){
                    callTreeData({'treeUrl':data.data['hostUrl']});
                }else if(data.data['kind'].includes("Zenodo")){
                    callTreeData({'treeUrl':data.data['zenodoUrl']+'#tree_item0'});
                    $("#fileServerPath").val(data.data['zenodoUrl'].replace(/\/$/, ""));
                }else{
                    callTreeData({'treeUrl':data.data['other']});
                }
            }
        });
        e.preventDefault(); // block the traditional submission of the form.
    });

    //project form
    $('#projectform').submit(function (e) {
        $.ajax({
            type: "POST",
            url: "setproject",
            data: $('#projectform').serialize(), // serializes the form's elements.
            success: function (data) {
                buildServerTable(data.data);
            }
        });
        e.preventDefault(); // block the traditional submission of the form.
    });


    // Add new entry for names/ extra fields
    $("div[data-toggle=fieldset]").each(function(e) {
        var $this = $(this);
        //Add new entry
        $this.find("button[data-toggle=fieldset-add-row]").click(function() {
            var target = $($(this).data("target"));
            var oldrow = target.find("table tr:last");
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
            if($this.find("table tr").length > 1) {
                var thisRow = $(this).closest("tr");
                thisRow.remove();
            }
        }); //End remove row

    });


    // info form
    $('#infoform').submit(function (e) {
        $.ajax({
            type: "POST",
            url: "info",
            data: $('#infoform').serialize(), // serializes the form's elements.
            success: function (data) {
                buildInfoTable(data.data);
            }
        });
        e.preventDefault(); // block the traditional submission of the form.
    });

    // reference form
    $('#referenceform').submit(function (e) {
        $.ajax({
            type: "POST",
            url: "reference",
            data: $('#referenceform').serialize(), // serializes the form's elements.
            success: function (data) {
                buildReferenceTable(data.data);
            },
            error: function(xhr, status, error) {
                var errorMessage = xhr.status + ': ' + xhr.statusText;
                $("#warning").toggle();
                $("#warning-message").html(errorMessage);
            }
        });
        e.preventDefault(); // block the traditional submission of the form.
    });

    // chart form
    $('#chartform').submit(function (e) {
        $.ajax({
            type: "POST",
            url: "charts",
            data: $('#chartform').serialize(), // serializes the form's elements.
            success: function (data) {
                buildChartTables(data.chartList,data.fileServerPath);
                addToWorkflow();
            }
        });
        e.preventDefault(); // block the traditional submission of the form.
    });

    // chart form delete
    $('#btnChartDelete').on('click',function (e) {
        $.ajax({
            type: "POST",
            url: "charts/delete",
            data: $('#chartform').serialize(), // serializes the form's elements.
            success: function (data) {
                buildChartTables(data.chartList,data.fileServerPath);
                addToWorkflow();
            }
        });
        e.preventDefault(); // block the traditional submission of the form.
    });

    // tool form
    $('form[name="tools"] input[name=kind]').on( "change", function() {
         var test = $(this).val();
         $('form[name="tools"] .toolClass').hide();
         $('form[name="tools"] #'+test).show();
    });

    $('#toolform').submit(function (e) {
        $.ajax({
            type: "POST",
            url: "tools",
            data: $('#toolform').serialize(), // serializes the form's elements.
            success: function (data) {
                buildToolTables(data.toolList,data.fileServerPath);
                addToWorkflow();
            }
        });
        e.preventDefault(); // block the traditional submission of the form.
    });

     // tool form delete
    $('#btnToolDelete').on('click',function (e) {
        $.ajax({
            type: "POST",
            url: "tools/delete",
            data: $('#toolform').serialize(), // serializes the form's elements.
            success: function (data) {
                buildToolTables(data.toolList,data.fileServerPath);
                addToWorkflow();
            }
        });
        e.preventDefault(); // block the traditional submission of the form.
    });

    // dataset form
    $('#datasetform').submit(function (e) {
        $.ajax({
            type: "POST",
            url: "datasets",
            data: $('#datasetform').serialize(), // serializes the form's elements.
            success: function (data) {
                buildDatasetTables(data.datasetList,data.fileServerPath);
                addToWorkflow();
            }
        });
        e.preventDefault(); // block the traditional submission of the form.
    });

     // dataset form delete
    $('#btnDatasetDelete').on('click',function (e) {
        $.ajax({
            type: "POST",
            url: "datasets/delete",
            data: $('#datasetform').serialize(), // serializes the form's elements.
            success: function (data) {
                buildDatasetTables(data.datasetList,data.fileServerPath);
                addToWorkflow();
            }
        });
        e.preventDefault(); // block the traditional submission of the form.
    });

    // script form
    $('#scriptform').submit(function (e) {
        $.ajax({
            type: "POST",
            url: "scripts",
            data: $('#scriptform').serialize(), // serializes the form's elements.
            success: function (data) {
                buildScriptTables(data.scriptList,data.fileServerPath);
                addToWorkflow();
            }
        });
        e.preventDefault(); // block the traditional submission of the form.
    });

     // script form delete
    $('#btnScriptDelete').on('click',function (e) {
        $.ajax({
            type: "POST",
            url: "scripts/delete",
            data: $('#scriptform').serialize(), // serializes the form's elements.
            success: function (data) {
                buildScriptTables(data.scriptList,data.fileServerPath);
                addToWorkflow();
            }
        });
        e.preventDefault(); // block the traditional submission of the form.
    });

    // documentation form
    $('#documentationform').submit(function (e) {
        $.ajax({
            type: "POST",
            url: "documentation",
            data: $('#documentationform').serialize(), // serializes the form's elements.
            success: function (data) {
                buildDocumentationTable(data.data);
            }
        });
        e.preventDefault(); // block the traditional submission of the form.
    });

    // publish form
    $('#publishform').submit(function (e) {
        $.ajax({
            type: "POST",
            url: "publish",
            data: $('#publishform').serialize(), // serializes the form's elements.
            success: function (data) {
                if(data.error){
                    var errorstring = '<ul><li>' + data.error.join("</li><li>"); + '</li></ul>';
                    bootbox.alert(errorstring);
                }else {
                    window.location.href = data.data;
                    $('#publishModal').modal('hide');
                }
            },
            error: function(xhr, status, error) {
                var errorMessage = xhr.status + ': ' + xhr.statusText;
                $("#warning").toggle();
                $("#warning-message").html(errorMessage);
            }
        });
        e.preventDefault(); // block the traditional submission of the form.
    });

    $(document).on('click', '.button-icon', function () {
        $(this).toggleClass("active");
        $(this).next(".icons-charts").toggleClass("open");
    });


    $('#detailsLink').on('click',function () {
        $('#showCurator').hide();
        $('#editCurator').show();
        $('#detailsOne').collapse('show');
    });

    $('#serverLink').on('click',function () {
        $('#showServer').hide();
        $('#editServer').show();
        $('#serverOne').collapse('show');
    });

    $('#projectLink').on('click',function () {
        $('#showProject').hide();
        $('#editProject').show();
        $('#projectOne').collapse('show');
    });

    $('#infoLink').on('click',function () {
        $('#showInfo').hide();
        $('#editInfo').show();
        $('#infoOne').collapse('show');
    });
    $('#documentationLink').on('click',function () {
        $('#showDocumentation').hide();
        $('#editDocumentation').show();
        $('#documentationOne').collapse('show');
    });

    $('#referenceLink').on('click',function () {
        $('#showReference').hide();
        $('#editReference').show();
        $('#referenceOne').collapse('show');
    });


    $('form[name="serverform"] input[name=kind]').on( "change", function() {
        var test = $(this).val();
        $('form[name="serverform"] .serverClass').hide();
        $('form[name="serverform"] #'+test).show();
    });


    $('#btnCopy').on('click',function () {
        copyContent();
        $('#treeModal').modal('hide');
    });

    // Add minus icon for collapse element which is open by default
    $(".collapse.show").each(function(){
        $(this).prev(".card-header").find(".fa-angle-down").addClass("fa-angle-up").removeClass("fa-angle-down");
    });

    // Toggle plus minus icon on show hide of collapse element
    $(".collapse").on('show.bs.collapse', function(){
        $(this).prev(".card-header").find(".fa-angle-down").removeClass("fa-angle-down").addClass("fa-angle-up");
    }).on('hide.bs.collapse', function(){
        $(this).prev(".card-header").find(".fa-angle-up").removeClass("fa-angle-up").addClass("fa-angle-down");
    });


    $('.folder-tree').on('click',function () {
        $('#treeModal').modal('show');
        var url = $('#lblProject').text().includes("zenodo") ? $('#lblProject').text() +'#tree_item0' : $('#lblProject').text();
        callTreeDataForCuration({'treeUrl':url});
        var fieldname = $(this).attr('name').split("-")[0];
        var formname = $(this).closest("form").attr('name');
        $(".tree-modal-form #formname").val(formname);
        $(".tree-modal-form #fieldname").val(fieldname);
    });

    // link for previewing metadata
    $('#previewLink').on('click',function (e) {
         $.ajax({
            type: "GET",
            url: "download",
            success: function (data) {
                var previewAnchorElem = document.getElementById("previewData");
                var previewFolder = data["previewFolder"];
                previewAnchorElem.setAttribute("href", "/preview/"+previewFolder);
                previewAnchorElem.setAttribute("target", "_blank");
                previewAnchorElem.click();
            }
        });
        e.preventDefault(); // block the traditional submission of the form.
    });

    // link for downloading metadata
    $('#downloadLink').on('click',function (e) {
         $.ajax({
            type: "GET",
            url: "download",
            success: function (data) {
                var blob = new Blob([JSON.stringify(data["paper"])],{type: "text/json;charset=utf-8;"});
				if (navigator.msSaveBlob) { // IE 10+
						navigator.msSaveBlob(blob, "data.json")
				}
				else {
                    var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data["paper"]));
                    var dlAnchorElem = document.getElementById("downloadData");
                    dlAnchorElem.setAttribute("href", dataStr);
                    dlAnchorElem.setAttribute("download", "data.json");
                    dlAnchorElem.click();
                }
            }
        });
        e.preventDefault(); // block the traditional submission of the form.
    });
});

/* Functions */

function onReaderLoad(event) {
    $('#myTextArea').val(event.target.result.toString());
    $('#Save').removeAttr('disabled'); // updated according to https://stackoverflow.com/questions/7637790/how-to-remove-disabled-attribute-with-jquery-ie
}



function copyContent(){
    var values = [];
    var projectName = $("#lblProject").text();
    var formname = $("#formname").val();
    var fieldname = $("#fieldname").val();
    $("#tree-modal").fancytree("getTree").visit(function (node) {
        if (node.selected) {
            if (node.folder != "true") {
                var keypath = node.key;
                var path = keypath.substring(keypath.indexOf(projectName) + projectName.length).replace(/\/$/, "");
                values.push(path);
                var copiedcontent = values.slice();
                $('form[name='+formname+'] #'+fieldname+'').val(copiedcontent);
            }
        }
    });
    $("#tree-modal").fancytree("getTree").visit(function (node) {
        node.setSelected(false);
    });
}

function buildCuratorTable(data) {
    if(data && data.firstName && data.lastName) {
        $('#editCurator').hide();
        $('#showCurator').show();
        $('#serverOne').collapse('show');
        $("#lblCuratorName").html(data.firstName + " " + data.middleName + " " + data.lastName);
        $("#lblCuratorEmail").html(data.emailId);
        $("#lblCuratorAffiliation").html(data.affiliation);
    }
}

function buildServerTable(data){
    if(data && data.fileServerPath) {
        $('#editServer').hide();
        $('#showServer').show();
        $('#treeServerModal').modal('hide');
        $('#infoOne').collapse('show');
        $("#lblProject").html(data.fileServerPath);
    }
}

function buildProjectTable(data){
    $("#lblProject").html(data.folderAbsolutePath);
    if(typeof data.services !== 'undefined'){
        data.services.forEach(function(element) {
            if (element){
                toggleOnOff(true,element);
            }
        });
    }
    if(data.isConfigFile === "N"){
        var r = window.confirm("Are you sure you want to curate the paper at the location "+data.folderAbsolutePath);
        if (r != true) {
            return;
        }
    }

}

function buildInfoTable(data){
    if(data && data.PIs && data.collections){
        $('#editInfo').hide();
        $('#showInfo').show();
        $('#referenceOne').collapse('show');
        var PIs = "";
        $.each(data.PIs, function (index, item) {
            var fullname = item.middleName ? item.firstName + " " + item.middleName + " " + item.lastName : item.firstName + " " + item.lastName;
            PIs = PIs + fullname + ", ";
        });
        PIs = PIs.replace(/,\s*$/, "");
        $("#lblInfoPIs").html(PIs);
        $("#lblInfoCollections").html(data.collections);
        $("#lblInfoTags").html(data.tags);
        $("#lblInfoNotebookFile").html(data.notebookFile);
    }
}

function buildReferenceTable(data){
    if(data && data.title && data.publishedAbstract){
        $('#editReference').hide();
        $('#showReference').show();
        $("#lblTitle").html(data.title);
        var authors = "by ";
        $.each(data.authors, function (index, item) {
            var fullname = item.middleName ? item.firstName + " " + item.middleName + " " + item.lastName : item.firstName + " " + item.lastName;
            authors = authors + fullname + ", ";
        });
        authors = authors.replace(/,\s*$/, "");
        $("#lblAuthor").html(authors);
        //publication
        var journal = "<a target='_blank' href='http://DOI.org/" + data.DOI + "'>" + data.journal.fullName + " (" + data.year + "), " + data.page + ", "+ data.volume +" </a>";
        $("#lblPublishedIn").html(journal);
        $("#lblPaperAbstract").html(data.publishedAbstract);
    }
}
function buildDocumentationTable(data){
    if(data && data.readme){
        $('#editDocumentation').hide();
        $('#showDocumentation').show();
        $("#lblReadme").html(data.readme);
    }
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
                        bootbox.alert("recheck your DOI");
                    }else {
                        fillValues(data.data, "reference"); // display the returned data in the console.
                    }
                }
        });
}

function callTreeData(searchdata){
    $.ajax({
        method: 'POST',
        url: '/getTreeInfo',
        dataType: "json",
        contentType: "application/json ; charset=utf-8",
        data: JSON.stringify(searchdata),
        success: function (data) {
            if("services" in data) {
                if ("notebookPath" in data.services) {
                    $("#notebookPath").val(data.services['notebookPath']);
                }
                if ("downloadPath" in data.services) {
                    $("#downloadPath").val(data.services['downloadPath']);
                }
                if ("gitPath" in data.services) {
                    $("#gitPath").val(data.services['gitPath']);
                }
            }
            $("#projtree").fancytree({
                checkbox: false,
                selectMode: 1,
                persist: {
                    expandLazy: false,
                    overrideSource: true,
                    store: "cookie", // force using cookies!
                },
                source: data.listObjects,
                lazyLoad: function (event, data) {
                    var searchdata = {};
                    var node = data.node;
                    searchdata["treeUrl"] = node.key;
                    if(typeof data.services !== 'undefined'){
                        data.services.forEach(function(element) {
                            if (element){
                                toggleOnOff(true,element);
                            }
                        });
                    }


                    data.result = $.ajax({
                        url: '/getTreeInfo',
                        method: 'POST',
                        dataType: "json",
                        contentType: "application/json ; charset=utf-8",
                        data: JSON.stringify(searchdata),
                        cache: false,
                        success: function (resp) {
                            node.addChildren(resp.listObjects);
                            node.toggleExpanded();
                            if(typeof resp.services !== 'undefined'){
                                resp.services.forEach(function(element) {
                                    if (element){
                                        toggleOnOff(true,element);
                                    }
                                });
                            }

                        },
                        error: function (jqXHR, status, thrownError) {
                            alert("Error in Server Details/Access rights. Please recheck");
                        }

                    });
                },
                activate: function (event, data) {
                    $("#fileServerPath").val(data.node.key.replace(/\/$/, ""));
                },
                cookieId: "fancytree-Cb4",
                idPrefix: "fancytree-Cb4-"
            });
            $('#projtree').fancytree('getTree').reload(data.listObjects);
        },
        error: function (jqXHR, status, thrownError) {
            alert("No Access to folder. Please recheck");
        }
    });
}

function callTreeDataForCuration(searchdata){
    $.ajax({
        method: 'POST',
        url: '/getTreeInfo',
        dataType: "json",
        async:"false",
        contentType: "application/json ; charset=utf-8",
        data: JSON.stringify(searchdata),
        success: function (data) {
            $("#tree-modal").fancytree({
                checkbox: true,
                selectMode: 3,
                persist: {
                    expandLazy: false,
                    overrideSource: false,
                    store: "cookie", // force using cookies!
                },
                source: data.listObjects,
                lazyLoad: function (event, data) {
                    var searchdata = {};
                    var node = data.node;
                    searchdata["treeUrl"] = node.key;
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
}

function buildChartTables(chartDetails,path) {
    $('#chartModal').modal('hide');
    if(chartDetails && chartDetails.length > 0) {
        $('#editWorkflow').show();
        $('#tblcharts').show();
        var tableCharts = $('#tblcharts')
            .DataTable(
                {
                    "processing": true,
                    "serverSide": false,
                     "scrollX": true,
                    "destroy": true,
                    "data": chartDetails,
                    "lengthMenu": [[10, 25, 50, 100, 500, -1],
                        [10, 25, 50, 100, 500, "All"]],
                    "pageLength": 10,
                    "deferRender": true,
                    "responsive": true,
                    "autoWidth": false,
                    "columns": [
                        {
                            "data": "id",
                            "visible": false,
                            "searchable": false,
                            "sortable": false
                        },
                        {
                            "data": "imageFile",
                            "visible": false,
                            "searchable": false,
                            "sortable": false
                        },
                        {
                            "data": null,
                            "sortable": false,
                            "searchable": true,
                            "render": function (data, type, row) {
                                var chartInfo = "<div class='span2'><a rel='prettyPhoto' title='"
                                    + $.trim(row.number)
                                    + ": "
                                    + $.trim(row.caption)
                                    + "' href='"
                                    + $
                                        .trim(path)
                                    + "/"
                                    + $.trim(row.imageFile)
                                    + "' class='thumbnail hover_icon'><img data-original='"
                                    + $
                                        .trim(path)
                                    + "/"
                                    + $.trim(row.imageFile)
                                    + "' class='img-responsive img-thumbnail lazy' alt='"
                                    + $.trim(row.caption)
                                    + "' title='"
                                    + $.trim(row.caption)
                                    + "' style='background-image: url(/static/images/transparent.gif);' ></a><div class='text-center'><h6>"
                                    + " "
                                    + $.trim(row.number)
                                    + "</h6></div></div>";

                                chartInfo += "<div id='toolbar'><div style='width: 100%; float: left; margin-bottom: 15px;'>";
                                chartInfo += "<div class='button-icon'></div>";
                                chartInfo += "<ul class='icons-charts'>";
                                var imageFileName = $.trim(row.imageFile);
                                var lastSlash = imageFileName.lastIndexOf("/");
                                var imageName = (lastSlash > 0) ? imageFileName
                                        .substring(0, imageFileName
                                            .lastIndexOf("/"))
                                    : "";
                                var datatree = (imageFileName == "") ? ""
                                    : "<li><a href='"
                                    + $
                                        .trim(path)
                                    + "/"
                                    + imageName
                                    + "' title='View the Data Tree' target='_blank'><img src='/static/images/datatree.png' alt='datatree'></a></li>";

                                var notebookPath = $.trim(path);
                                if (notebookPath != "") {
                                        notebookPath = notebookPath.replace(/^(https?:\/\/)?(www\.)?/, '');
                                        notebookPath = "http://nbviewer.jupyter.org/url/" + notebookPath;
                                }
                                var notebooks = ($
                                    .trim(row.notebookFile) == "") ? ""
                                    : "<li><a href='"
                                    + notebookPath
                                    + "/"
                                    + $.trim(row.notebookFile)
                                    + "' title='View the Jupyter Notebook' target='_blank' ><img src='/static/images/jupyter.png' alt='jupyter'></a></li>";

                                var downloads = ($
                                    .trim(path) == "") ? ""
                                    : "<li><a href='"
                                    + $
                                        .trim(path)
                                    + "' title='Download the data source for the chart from this Endpoint' target='_blank'><img src='/static/images/download-icon.png' alt='download'></a></li>";

                                chartInfo += datatree + downloads + notebooks + "</ul></div>";
                                return chartInfo;

                            },
                            "width": "50%"
                        },
                        {
                            "data": "number",
                            "visible": false,
                            "sortable": false,
                            "searchable": false


                        },
                        {
                            "data": "caption",
                            "visible": false,
                            "sortable": false,
                            "searchable": false

                        },
                        {
                            "data": "properties",
                            "width": "20%",
                            "searchable": true,
                            "visible": true
                        },
                        {
                            "data": "files",
                            "render": function (data, type, row) {
                                var data = data.split(",");
                                var filesLink = "<div class='span2'>";
                                $
                                    .each(
                                        data,
                                        function (index,
                                                  item) {
                                            var file = $.trim(item);
                                            var fileName = (file == "") ? ""
                                                : file
                                                    .substring(file
                                                        .lastIndexOf("/") + 1);

                                            filesLink += "<a href='"
                                                + $
                                                    .trim(path)
                                                + "/"
                                                + file
                                                + "' title='Click to view "
                                                + fileName
                                                + "' target='_blank'>"
                                                + fileName
                                                + "</a>, ";
                                        });
                                filesLink = filesLink.replace(
                                    /,\s*$/, "");
                                return filesLink;
                            },
                            "width": "20%",
                            "searchable": true
                        },
                        {
                            "data": null,
                            "sortable": false,
                            "searchable": false,
                            "render": function (data, type, row) {
                                var chartdata = JSON.stringify(row);
                                var editLink = "<a id='chartLink' title='Edit the current chart' onclick='fillValues("
                                    + chartdata
                                    + ", &quot;charts&quot;)'><i class='fa fa-edit custom-icon' title='Edit the chart'></i></a>";
                                return editLink;
                            },
                            "width": "10%"
                        }
                    ],
                    "search": {
                        // "search" : "Type here...",
                        "caseInsensitive": true,
                        "regex": false,
                        "smart": true
                    },
                    drawCallback: function () {
                        $("#divCharts").show();
                        $("a[rel^='prettyPhoto']").prettyPhoto({
                            show_title: false,
                            social_tools: ''
                        }); // , theme: 'facebook'

                        $("img.lazy").lazyload({
                            effect: "fadeIn",
                            skip_invisible: true
                        });


                    }
                });
    }else{
        $('#tblcharts').hide();
    }

}


function buildToolTables(toolDetails, path) {
    $('#toolModal').modal('hide');
    if(toolDetails && toolDetails.length > 0) {
        $('#editWorkflow').show();
        $('#tbltools').show();
        var tableDatasets = $('#tbltools')
            .DataTable(
                {
                    "processing": true,
                    "serverSide": false,
                    "destroy": true,
                    "data": toolDetails,
                    "lengthMenu": [[10, 25, 50, 100, 500, -1],
                        [10, 25, 50, 100, 500, "All"]],
                    "pageLength": 10,
                    "deferRender": true,
                    "responsive": true,
                    "autoWidth": false,
                    "columns": [
                        {
                            "data": "id",
                            "visible": false,
                            "searchable": false,
                            "sortable": false
                        },
                        {
                            "data": "kind",
                            "visible": true,
                            "searchable": true,
                            "width": "30%"
                        },
                        {
                            "data": null,
                            "visible": true,
                            "searchable": true,
                            "render": function (data, type, row) {
                                var divblock = "<div id='instrument'>";
                                var softwareblock = "<div id='software-details'>";
                                var experimentblock = "<div id='experiment-details'>"
                                if(row.packageName && row.version) {
                                    softwareblock = softwareblock + "<b> Package Name: </b> " + row.packageName + "<br/> <b> Version: </b> " + row.version + "</div>";
                                }else if(row.facilityName && row.measurement){
                                    experimentblock = experimentblock + "<b> Facility Name: </b> " + row.facilityName + "<br/> <b> Measurement: </b> " + row.measurement + "</div>";
                                }
                                return divblock + softwareblock + experimentblock + "</div>"
                            },
                            "width": "60%"
                        },
                        {
                            "data": null,
                            "sortable": false,
                            "searchable": false,
                            "render": function (data, type, row) {
                                var tooldata = JSON.stringify(row);
                                var editLink = "<a id='toolLink' title='Edit the current tool' onclick='fillValues("
                                    + tooldata
                                    + ", &quot;tools&quot;)'><i class='fa fa-edit custom-icon' title='Edit the tool'></i></a>";
                                return editLink;
                            },
                            "width": "10%"
                        }
                        ],
                    "search": {
                        "caseInsensitive": true,
                        "regex": false,
                        "smart": true
                    }
                });
    }else{
        $('#tbltools').hide();
    }
}



function buildDatasetTables(datasetDetails, path) {
    $('#datasetModal').modal('hide');
    if(datasetDetails && datasetDetails.length > 0) {
        $('#editWorkflow').show();
        $('#tbldatasets').show();
        var tableDatasets = $('#tbldatasets')
            .DataTable(
                {
                    "processing": true,
                    "serverSide": false,
                    "destroy": true,
                    "data": datasetDetails,
                    "lengthMenu": [[10, 25, 50, 100, 500, -1],
                        [10, 25, 50, 100, 500, "All"]],
                    "pageLength": 10,
                    "deferRender": true,
                    "responsive": true,
                    "autoWidth": false,
                    "columns": [
                        {
                            "data": "id",
                            "visible": false,
                            "searchable": false,
                            "sortable": false
                        },
                        {
                            "data": "readme",
                            "title": "Description",
                            "visible": true,
                            "width": "50%"
                        },
                        {
                            "data": "files",
                            "title": "Files",
                            "visible": true,
                            "width": "40%",
                            "render": function (data, type, row) {
                                var data = data.split(",");
                                var filesLink = "<div class='span2'>";
                                $.each(data, function (index, item) {
                                    var file = $.trim(item);
                                    var fileName = (file == "") ? ""
                                        : file
                                            .substring(file
                                                .lastIndexOf("/") + 1);

                                    filesLink += "<a href='"
                                        + $
                                            .trim(path)
                                        + "/"
                                        + file
                                        + "' title='Click to view "
                                        + fileName
                                        + "' target='_blank'>"
                                        + fileName
                                        + "</a>, ";
                                });
                                filesLink = filesLink.replace(
                                    /,\s*$/, "");
                                return filesLink;
                            },
                            "searchable": true
                        },
                        {
                            "data": null,
                            "sortable": false,
                            "searchable": false,
                            "render": function (data, type, row) {
                                var datasetdata = JSON.stringify(row);
                                var editLink = "<a id='datasetLink' title='Edit the current dataset' onclick='fillValues("
                                    + datasetdata
                                    + ", &quot;datasets&quot;)'><i class='fa fa-edit custom-icon' title='Edit the dataset'></i></a>";
                                return editLink;
                            },
                            "width": "10%"
                        }],
                    "search": {
                        "caseInsensitive": true,
                        "regex": false,
                        "smart": true
                    }
                });
    }else{
        $('#tbldatasets').hide();
    }
}

function buildScriptTables(scriptDetails, path) {
    $('#scriptModal').modal('hide');
    if(scriptDetails && scriptDetails.length > 0) {
        $('#editWorkflow').show();
        $('#tblscripts').show();
        var tableScripts = $('#tblscripts')
            .DataTable(
                {
                    "processing": true,
                    "serverSide": false,
                    "destroy": true,
                    "data": scriptDetails,
                    "lengthMenu": [[10, 25, 50, 100, 500, -1],
                        [10, 25, 50, 100, 500, "All"]],
                    "pageLength": 10,
                    "deferRender": true,
                    "responsive": true,
                    "autoWidth": false,
                    "columns": [
                        {
                            "data": "id",
                            "visible": false,
                            "searchable": false,
                            "sortable": false
                        },
                        {
                            "data": "readme",
                            "title": "Description",
                            "visible": true,
                            "width": "50%"
                        },
                        {
                            "data": "files",
                            "title": "Files",
                            "visible": true,
                            "width": "50%",
                            "render": function (data, type, row) {
                                var data = data.split(",");
                                var filesLink = "<div class='span2'>";
                                $.each(data, function (index, item) {
                                    var file = $.trim(item);
                                    var fileName = (file == "") ? ""
                                        : file
                                            .substring(file
                                                .lastIndexOf("/") + 1);

                                    filesLink += "<a href='"
                                        + $
                                            .trim(path)
                                        + "/"
                                        + file
                                        + "' title='Click to view "
                                        + fileName
                                        + "' target='_blank'>"
                                        + fileName
                                        + "</a>, ";
                                });
                                filesLink = filesLink.replace(
                                    /,\s*$/, "");
                                return filesLink;
                            },
                            "searchable": true

                        },
                        {
                            "data": null,
                            "sortable": false,
                            "searchable": false,
                            "render": function (data, type, row) {
                                var scriptdata = JSON.stringify(row);
                                var editLink = "<a id='scriptLink' title='Edit the current script' onclick='fillValues("
                                    + scriptdata
                                    + ", &quot;scripts&quot;)'><i class='fa fa-edit custom-icon' title='Edit the script'></i></a>";
                                return editLink;
                            },
                            "width": "10%"
                        }],
                    "search": {
                        "caseInsensitive": true,
                        "regex": false,
                        "smart": true
                    }
                });
    }else{
        $('#tblscripts').hide();
    }
}

// fills values of form to edit based on edit buton click
function fillValues(obj,type) {
    if(type === 'charts') {
        $("#chartModal").modal('show');
        $('form[name="charts"] #id').val(obj.id);
        $('form[name="charts"] #caption').val(obj.caption);
        $('form[name="charts"] #number').val(obj.number);
        $('form[name="charts"] #files').val(obj.files);
        $('form[name="charts"] #imageFile').val(obj.imageFile);
        $('form[name="charts"] #notebookFile').val(obj.notebookFile);
        $('form[name="charts"] #properties').val(obj.properties);
        // $('form[name="charts"] #saveas').val(obj.saveas);
        $.each(obj.extraFields, function( index, value ) {
            $('form[name="charts"] #extraFields-'+index+'-extrakey').val(value.extrakey);
            $('form[name="charts"] #extraFields-'+index+'-extravalue').val(value.extravalue);
        });
        $('#btnChartDelete').show();
    }
    else if(type === 'tools') {
        $("#toolModal").modal('show');
        $('form[name="tools"] #id').val(obj.id);
        $('form[name="tools"] input[name=kind][value="' + obj.kind + '"]').prop('checked', true).change();
        $('form[name="tools"] #packageName').val(obj.packageName);
        $('form[name="tools"] #URLs').val(obj.URLs);
        $('form[name="tools"] #version').val(obj.version);
        $('form[name="tools"] #programName').val(obj.programName);
        $('form[name="tools"] #patches').val(obj.patches);
        $('form[name="tools"] #description').val(obj.description);
        $('form[name="tools"] #facilityName').val(obj.facilityName);
        $('form[name="tools"] #measurement').val(obj.measurement);
        // $('form[name="tools"] #saveas').val(obj.saveas);
        $.each(obj.extraFields, function( index, value ) {
            $('form[name="tools"] #extraFields-'+index+'-extrakey').val(value.extrakey);
            $('form[name="tools"] #extraFields-'+index+'-extravalue').val(value.extravalue);
        });
        $('#btnToolDelete').show();
    }
     else if(type === 'datasets') {
        $("#datasetModal").modal('show');
        $('form[name="datasets"] #id').val(obj.id);
        $('form[name="datasets"] #files').val(obj.files);
        $('form[name="datasets"] #readme').val(obj.readme);
        $('form[name="datasets"] #URLs').val(obj.URLs);
        $.each(obj.extraFields, function( index, value ) {
            $('form[name="datasets"] #extraFields-'+index+'-extrakey').val(value.extrakey);
            $('form[name="datasets"] #extraFields-'+index+'-extravalue').val(value.extravalue);
        });
        $('#btnDatasetDelete').show();
    }
     else if(type === 'scripts') {
        $("#scriptModal").modal('show');
        $('form[name="scripts"] #id').val(obj.id);
        $('form[name="scripts"] #files').val(obj.files);
        $('form[name="scripts"] #readme').val(obj.readme);
        $('form[name="scripts"] #URLs').val(obj.URLs);
        $.each(obj.extraFields, function( index, value ) {
            $('form[name="scripts"] #extraFields-'+index+'-extrakey').val(value.extrakey);
            $('form[name="scripts"] #extraFields-'+index+'-extravalue').val(value.extravalue);
        });
        $('#btnScriptDelete').show();
    }
    else if(type === 'reference') {
        $('form[name="reference"] input[name=kind][value="' + obj.kind + '"]').prop('checked', true).change();
        $('form[name="reference"] #DOI').val(obj.DOI);
        $('form[name="reference"] #title').val(obj.title);
        $('form[name="reference"] #journal-fullName').val(obj.journal.fullName);
        $.each(obj.authors, function( index, value ) {
            $("#author-fieldset").each(function() {
                var $this = $(this);
                 if(value.firstName) {
                     // $this.find("button[data-toggle=fieldset-remove-row-authors]").trigger('click');
                     if($('#authors-' + index + '-firstName').length) {
                         $('#authors-' + index + '-firstName').val(value.firstName);
                         $('#authors-' + index + '-middleName').val(value.middleName);
                         $('#authors-' + index + '-lastName').val(value.lastName);
                     }else{
                        $this.find("#author-add-row-button").trigger('click');
                         var oldrow = $this.find("#authorTable tr:last");
                         var row = oldrow.clone(true, true);
                         var elem_id = row.find(":input")[0].id;
                         var elem_num = parseInt(elem_id.replace(/.*-(\d{1,4})-.*/m, '$1'));
                         $('#authors-' + elem_num + '-firstName').val(value.firstName);
                         $('#authors-' + elem_num + '-middleName').val(value.middleName);
                         $('#authors-' + elem_num + '-lastName').val(value.lastName);
                     }
                }
            });
        });


        $('form[name="reference"] #URLs').val(obj.URLs);
        $('form[name="reference"] #school').val(obj.school);
        $('form[name="reference"] #year').val(obj.year);
        $('form[name="reference"] #volume').val(obj.volume);
        $('form[name="reference"] #publishedAbstract').val(obj.publishedAbstract);
        $('form[name="reference"] #page').val(obj.page);

    }
}

function toggleOnOff(state,service){

    if(state){
        $('.on'+service.toString()).prop('checked','checked');
        $('#hole'+service.toString()).removeClass();
        $('#hole'+service.toString()).addClass('green');
        $('#text'+service.toString()).text('YES');
    }else {
        $('.off'+service.toString()).prop('checked','checked');
        $('#hole'+service.toString()).removeClass();
        $('#hole'+service.toString()).addClass('red');
        $('#text'+service.toString()).text('NO');
    }
}

function addToWorkflow(){
    $.ajax({
        method: 'POST',
        url: '/addToWorkflow',
        dataType: "json",
        contentType: "application/json ; charset=utf-8",
        success: function (data) {
            bindWorkflow(data.data);
        }
    });
}



var changeChosenNodeSize = function (values, id, selected, hovering) {
    values.size = 30;
}
var changeChosenLegendNodeSize = function (values, id, selected, hovering) {
    values.size = 23;
}
var changeChosenEdgeMiddleArrowScale = function (values, id, selected,
                                                 hovering) {
    values.middleArrowScale = 1.1;
}
var network = null;
var connections = [];
var nodeId = 0;
var edgeId = 0;
var nodes = new vis.DataSet();
// create an array with edges
var edges = new vis.DataSet();

var headInfo = [];
var headNum = -1;
function bindWorkflow(jsonData) {
    network = null;
    connections = [];
    nodeId = 0;
    edgeId = 0;
    nodes = new vis.DataSet();
    edges = new vis.DataSet();
    headInfo = [];
    headNum = -1;
    nodes.clear();
    edges.clear();

    var colors = {
        "red": "h",
        "blue": "t",
        "gray": "d",
        "green": "s",
        "orange": "c"
    };
    var ColorSelection = function (value) {
        switch (value) {
            case colors.red:
                return "red";
                break;
            case colors.blue:
                return "blue";
                break;
            case colors.gray:
                return "gray";
                break;
            case colors.green:
                return "green";
                break;
            case colors.orange:
                return "orange";
                break;
        }
    }

    var ShapeSelection = function (value) {
        switch (value) {
            case colors.red:
                return "dot";
                break;
            case colors.blue:
                return "diamond";
                break;
            case colors.gray:
                return "dot";
                break;
            case colors.green:
                return "triangle";
                break;
            case colors.orange:
                return "square";
                break;
        }
    }

    var FontColorSelection = function (value) {
        switch (value) {
            case colors.red:
                return "black";
                break;
            case colors.blue:
                return "black";
                break;
            case colors.gray:
                return "black";
                break;
            case colors.green:
                return "black";
                break;
            case colors.orange:
                return "black";
                break;

        }
    };

    var TypeSelection = function (value) {
        switch (value) {
            case "red":
                return "Head";
                break;
            case "blue":
                return "Tools";
                break;
            case "gray":
                return "Datasets";
                break;
            case "green":
                return "Scripts";
                break;
            case "orange":
                return "Charts";
                break;
        }
    };

    var hasPath = function (var1, var2) {
        var flag = false;
        $.each(jsonData, function (key, value) {
            if (key == "edges") {
                $.each(value, function (item, val) {
                    if (var1 == val[0]) {
                        if (var2 == val[1]) {
                            flag = true;
                        }
                        if (hasPath(val[1], var2) == true) {
                            flag = true;
                        }
                    }
                })
            }
        })
        return flag;
    };


    var options = {
        edges: {
            // color: 'black',
            arrows: {
                middle: true
                // 					{
                // 						scaleFactor : 0.6
                // 					}
            },
            chosen: {
                label: false,
                edge: changeChosenEdgeMiddleArrowScale
            }
        },


        interaction: {
            hover: true,
            dragNodes :true
        },
        layout: {
            improvedLayout:true,
            randomSeed:undefined,
        },
        physics: false,
        manipulation: {
            addNode: function (data, callback) {
                // filling in the popup DOM elements
                document.getElementById('node-operation').innerHTML = "Add External";
                editNode(data, callback);
            },
            deleteNode: function (data, callback) {
                // filling in the popup DOM elements
                   if(data.nodes[0].includes("h")){
                       removeNode(data, callback);
                   }else{
                       bootbox.alert("Only head nodes can be removed");
                       callback(null);
                       return;
                   }
            },

            addEdge: function (data, callback) {
                if (data.from == data.to) {
                    var r = confirm("Do you want to connect the node to itself?");
                    if (r != true) {
                        callback(null);
                        return;
                    }
                }
                document.getElementById('edge-operation').innerHTML = "Add Edge";
                editEdgeWithoutDrag(data, callback);
            }

        }
        // autoResize: true

    };


    $.each(jsonData.desc, function (key, value) {
        var anetwork = document.getElementById('divWorkflow');
        var x = -anetwork.clientWidth / 2 + 50;
        var y = -anetwork.clientHeight / 1.8 + 50;
        var step = 80;
        if (key == "charts") {
            //NODES
            var cid = 0;
            $.each(value, function (index, val) {
                nodeId = nodeId + 1;
                cid = cid + 1;
                nodes.add([{
                    x:x,
                    y:y+ cid * step,
                    id: "c" + index.toString(),
                    label: val['id'],

                    shape : ShapeSelection("c"),
                    size: 23,
                    color: ColorSelection("c"),
                    title: val['caption'],
                    chosen: {
                        label: false,
                        node: changeChosenNodeSize
                    },
                    font: {
                        multi: 'html',
                        size: 0,
                        bold: {
                            color: '#0077aa'
                        }
                    },
                    cid: 1
                }]);


            });
        } else if (key == "datasets") {
            var anetwork = document.getElementById('divWorkflow');
            var x = -anetwork.clientWidth / 2 + 50;
            var y = -anetwork.clientHeight / 1.8 + 50;
            var step = 80;
            x = x + step;
            var did = 0;
            $.each(value, function (index, val) {
                nodeId = nodeId + 1;
                did = did + 1;
                nodes.add([{
                    x: x,
                    y: y + did * step,

                    id: "d" + index.toString(),
                    label: val['id'],
                    shape : ShapeSelection("d"),
                    size: 23,
                    color: ColorSelection("d"),
                    title: val['caption'],

                    chosen: {
                        label: false,
                        node: changeChosenNodeSize
                    },
                    font: {
                        multi: 'html',
                        size: 0,
                        bold: {
                            color: '#0077aa'
                        }
                    },
                    cid: 1
                }]);
            });
        } else if (key == "scripts") {
            var anetwork = document.getElementById('divWorkflow');
            var x = -anetwork.clientWidth / 2 + 50;
            var y = -anetwork.clientHeight / 1.8 + 50;
            var step = 80;
            x = x + 2 * step;
            var sid = 0;
            $.each(value, function (index, val) {
                nodeId = nodeId + 1;
                sid = sid + 1;
                nodes.add([{
                    x: x,
                    y: y+ sid * step,

                    id: "s" + index.toString(),

                    label: val['id'],

                    shape : ShapeSelection("s"),
                    size: 23,
                    color: ColorSelection("s"),
                    title: val['caption'],
                    chosen: {
                        label: false,
                        node: changeChosenNodeSize
                    },
                    font: {
                        multi: 'html',
                        size: 0,
                        bold: {
                            color: '#0077aa'
                        }
                    },
                    cid: 1
                }]);
            });
        }
        else if (key == "tools") {
            var anetwork = document.getElementById('divWorkflow');
            var x = -anetwork.clientWidth / 2 + 50;
            var y = -anetwork.clientHeight / 1.8 + 50;
            var step = 80;
            x = x + 3 * step;
            var tid = 0;
            $.each(value, function (index, val) {
                nodeId = nodeId + 1;
                tid = tid + 1;
                nodes.add([{
                    x:x,
                    y: y + tid * step,

                        id: "t" + index.toString(),

                    label: val['id'],

                    shape : ShapeSelection("t"),
                    size: 23,
                    color: ColorSelection("t"),
                    title: val['caption'],
                    chosen: {
                        label: false,
                        node: changeChosenNodeSize
                    },
                    font: {
                        multi: 'html',
                        size: 0,
                        bold: {
                            color: '#0077aa'
                        }
                    },
                    cid: 1
                }]);
            });
        }
        else if (key == "heads") {
            var hid = 0;
            var anetwork = document.getElementById('divWorkflow');
            var x = -anetwork.clientWidth / 2 + 50;
            var y = -anetwork.clientHeight / 1.8 + 50;
            var step = 80;
            x = x + 4 * step;
            $.each(value, function (index, val) {
                headNum = headNum + 1;
                nodeId = nodeId + 1;
                var head = {};
                head["id"] = "h"+ headNum.toString();
                head["readme"] = val['readme'];
                head["URLs"] = val['URLs'];
                headInfo.push(head);
                hid = hid + 1;
                nodes.add([{
                    x: x,
                    y: y + hid * step,
                    id: "h" + headNum.toString(),
                    label: val['id'] ? val['id'] : "h" + headNum.toString(),
                    shape : ShapeSelection("h"),
                    size: 10,
                    color: ColorSelection("h"),
                    title: val['caption'],
                    chosen: {
                        label: false,
                        node: changeChosenNodeSize
                    },
                    font: {
                        multi: 'html',
                        size: 0,
                        bold: {
                            color: '#0077aa'
                        }
                    },
                    cid: 1
                }]);
            });
        }
        else if (key == "edges") {
            //EDGES
            $.each(value, function (item, val) {
                $('#Save').removeAttr('disabled');
                edgeId = edgeId + 1;
                edges.add([{
                    from: val[0],
                    to: val[1],
                    id: edgeId
                }]);
            })
        }
    });

    function saveNodeData(data, callback) {
        if(document.getElementById('node-readme').value === ""){
            bootbox.alert("A read me to the External is mandatory.");
            return;
        }
        headNum = headNum + 1;
        var head = {};
        head["id"] = "h"+ headNum.toString();
        head["readme"] = document.getElementById('node-readme').value;
        head["URLs"] = document.getElementById('node-url').value;
        headInfo.push(head);
        nodeId = nodeId + 1;
        data.id = "h" + headNum.toString();
        data.color = ColorSelection("h");
        data.label = "h" + headNum.toString();
        data.shape = ShapeSelection("h");
        data.title = document.getElementById('node-readme').value;
        data.size = 10;
        data.font = {multi: 'html', size: 0, bold: {color: '#0077aa'}};
        data.cid = 1;
        clearNodePopUp();
        callback(data);
    }

    var data = {
        nodes: nodes,
        edges: edges
    };


    function removeNode(data, callback) {
        var datais = data.nodes[0];
        nodes.remove(data);
        var result = [];
        var value;
        for (index = 0; index < headInfo.length; ++index) {
            value = headInfo[index];
            if (value.includes(datais)) {
                // You've found it, the full text is in `value`.
                // So you might grab it and break the loop, although
                // really what you do having found it depends on
                // what you need.

            }else{
                result.push(value);
            }
        }
        headInfo = result;
        callback(data);
    }


    var container = document.getElementById('divWorkflow');
    // options = {};
    try{
    network = new vis.Network(container, data, options);
    network.moveTo({
        position: {x: 0, y: 0},
        scale: 1
    });
    }
    catch (err){
        console.log("Initial Workflow scale is not set. ",err);
    }

    function editNode(data, callback) {
        document.getElementById('node-label').value = data.label;
        document.getElementById('node-saveButton').onclick = saveNodeData.bind(this, data, callback);
        document.getElementById('node-cancelButton').onclick = clearNodePopUp.bind();
        document.getElementById('node-popUp').style.display = 'block';
    }

    function clearNodePopUp() {
        document.getElementById('node-saveButton').onclick = null;
        document.getElementById('node-cancelButton').onclick = null;
        document.getElementById('node-popUp').style.display = 'none';
    }

    function cancelNodeEdit(callback) {
        clearNodePopUp();
        callback(null);
    }



    function editEdgeWithoutDrag(data, callback) {
        // filling in the popup DOM elements
//                    document.getElementById('edge-label').value = data.label;
        saveEdgeData(data, callback);
//                    document.getElementById('edge-cancelButton').onclick = cancelEdgeEdit.bind(this, callback);
//                    document.getElementById('edge-popUp').style.display = 'block';
    }

    function clearEdgePopUp() {
        document.getElementById('edge-saveButton').onclick = null;
        document.getElementById('edge-cancelButton').onclick = null;
        document.getElementById('edge-popUp').style.display = 'none';
    }

    function cancelEdgeEdit(callback) {
        clearEdgePopUp();
        callback(null);
    }

    function saveEdgeData(data, callback) {
        if (typeof data.to === 'object')
            data.to = data.to.id;
        if (typeof data.from === 'object')
            data.from = data.from.id;
        edgeId = edgeId + 1;
        //data.label = edgeId;
        data.id = edgeId;
        $('#Save').removeAttr('disabled');
        clearEdgePopUp();
        callback(data);
    }

    var nodes1 = new vis.DataSet();
    var edges1 = new vis.DataSet();
    var mynetwork = document.getElementById('divLegend');
    var x = -mynetwork.clientWidth / 2 + 50;
    var y = -mynetwork.clientHeight / 1.8 + 60;
    var step = 83;
    nodes1.add({
        id: 1000,
        x: x,
        y: y + 10,
        label: 'Nodes',
        shape : 'text',
        size: 30,
        fixed: true,
        physics: false,
        font: {
            multi: true,
            color: '#357ebd',
            size: 30,
            bold: {
                color: '#357ebd'
            }
        },
    });
    nodes1.add({
        id: 1001,
        x: x,
        y: y + step + 10,
        label: 'External',
        title: 'The external node represents <br> content that was used <br> within the paper, <br> but documented elsewhere. <br> A reference/link is <br> typically provided.',
        color: 'red',
        size: 10,
        shape: 'dot',
        fixed: true,
        physics: false,
        chosen: {
            label: false,
            node: changeChosenLegendNodeSize
        }
    });
    nodes1.add({
        id: 1002,
        x: x,
        y: y + 2 * step,
        label: 'Dataset',
        shape : ShapeSelection("d"),
        title: 'The dataset nodes represent <br> data generated by <br> either a Tool or <br> Script node.',
        color: 'gray',
        size: 23,
        fixed: true,
        physics: false,
        chosen: {
            label: false,
            node: changeChosenLegendNodeSize
        }
    });
    nodes1.add({
        id: 1003,
        x: x,
        y: y + 3 * step,

        label: 'Script',
        shape : ShapeSelection("s"),
        title: 'The Script Node represents <br> the use of user-defined <br> procedures e.g. to analyze <br> or post-process datasets.',
        color: 'green',
        size: 23,
        fixed: true,
        physics: false,
        chosen: {
            label: false,


            node: changeChosenLegendNodeSize
        }
    });
    nodes1.add({
        id: 1004,
        x: x,
        y: y + 4 * step,
        label: 'Tool',
        shape : ShapeSelection("t"),
        title: 'The tool node represents <br> the use of an instrument <br> (either software or experimental <br> set up).',
        size: 23,
        color: 'blue',
        fixed: true,
        physics: false,
        chosen: {
            label: false,
            node: changeChosenLegendNodeSize
        }
    });
    nodes1.add({
        id: 1005,
        x: x,
        y: y + 5 * step,
        label: 'Chart',
        shape : ShapeSelection("c"),
        title: 'The chart node represents <br> a figure or a table, <br> and is typically considered <br> the end-point of <br> the workflow.',
        color: 'orange',
        size: 23,
        fixed: true,
        physics: false,
        chosen: {
            label: false,


            node: changeChosenLegendNodeSize
        }
    });


    var data1 = {
        nodes: nodes1,
        edges: edges1
    };
    var options1 = {
        edges: {
            color: 'black',
            arrows: {
                middle: true
                // 					{
                // 						scaleFactor : 0.6
                // 					}
            },
            chosen: {
                label: false,
                edge: changeChosenEdgeMiddleArrowScale
            }
        },

        physics: {
            minVelocity: 0.75
        },
        interaction: {
            hover: true
        }
    };

    options1.interaction.zoomView = false;

    var network1 = new vis.Network(mynetwork, data1, options1);

}




function connectedNodes() {
    var uniqueconnectednodes = [];
    for (var i = 1; i <= edgeId; i++) {
        var saves = [];
        if(edges.get(i)){
            if(edges.get(i).from && edges.get(i).to){
                if(nodes.get(edges.get(i).from) && nodes.get(edges.get(i).to)){
                    if(nodes.get(edges.get(i).from).id && nodes.get(edges.get(i).to).id){
                        uniqueconnectednodes.push(nodes.get(edges.get(i).from).id);
                        uniqueconnectednodes.push(nodes.get(edges.get(i).to).id);
                        saves.push(nodes.get(edges.get(i).from).id);
                        saves.push(nodes.get(edges.get(i).to).id);
                        if (saves.length > 0){
                            connections.push(saves);
                        }
                    }
                }
            }
        }
    }
    if (nodes.length !== unique(uniqueconnectednodes).length) {
        bootbox.confirm("There are unconnected nodes. Are you sure you want to continue?", function(result){
        if (result){
            saveNodesAndEdges();
        }
        else
            return;
        });
    }else{
        saveNodesAndEdges();
    }
}

function saveNodesAndEdges(){
        var plist = [];
		if (connections.length > 0) {
			plist.push(connections);
			plist.push(headInfo);
		}
		$.ajax({
			method: 'POST',
			url: '/saveNodesAndEdges',
			dataType: "json",
			contentType: "application/json ; charset=utf-8",
			data: JSON.stringify(plist),
			success: function (data) {
				addToWorkflow();
			}
		});
}
function unique(arr) {
    var u = {}, a = [];
    for (var i = 0, l = arr.length; i < l; ++i) {
        if (!u.hasOwnProperty(arr[i])) {
            a.push(arr[i]);
            u[arr[i]] = 1;
        }
    }
    return a;
}
function addPhysics() {
     if($("#Movement").is(':checked')) {
         network.setOptions({physics:{stabilization:false}});
     }else{
         network.setOptions({physics:{stabilization:true}});
     }
}

function showHideLabelForNodes(){
    if($("#LabelsVisibility").is(':checked')){
        nodes.forEach(function (node) {
            nodes.update({id:node.id,font:{size: 20} });
        });
    } else {
         nodes.forEach(function (node) {
            nodes.update({id:node.id,font:{size: 0} });
        });
    }
}





