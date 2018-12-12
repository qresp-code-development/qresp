var bindModal = function (info) {
    $('#myModalLabel').html(info[0]);
    $('#myModalLabel').css('position', 'absolute');
    $('#myModalBody').html(info[1]);

    $('#modalInfo').modal('show');
};

var changeChosenNodeSize = function (values, id, selected, hovering) {
    values.size = 40;
};

var changeChosenLegendNodeSize = function (values, id, selected, hovering) {
    values.size = 23;
};

var changeChosenEdgeMiddleArrowScale = function (values, id, selected,
                                                 hovering) {
    values.middleArrowScale = 1.1;
};


var canvasNetwork = null;
var legendNetwork = null;
var chartcanvasNetwork = null;
var chartlegendNetwork = null;

$(function () {
    $(document).on('click', '.button-icon', function () {
        $(this).toggleClass("active");
        $(this).next(".icons").toggleClass("open");
    });

    $('#tblcharts tbody').on('click', '.button-icon', function () {
        $(this).toggleClass("active");
        $(this).next(".icons-charts").toggleClass("open");
    });

    $('#PaperSection').on('click', '#btnMint', function () {
        return false;
    });
    $('#PaperSection').on('click', '#btnCite', function () {
        $(this).toggle();
        $(this).next("#doiText").toggle();
    });

    window.onresize = function () {
        canvasNetwork.fit();
    };
    window.onresize = function () {
        legendNetwork.fit();
    };
    var chartworkflowdetail = null;

    $('.workflowimg').each(function () {
        var $this = $(this);
        $this.on("click", function () {
            var values = $(this).data('workflow');
            var strvalues = values.split(',');
            var paperid = strvalues[0];
            var chartid = strvalues[1];
            $.getJSON('/charworkflow', {
                paperid: paperid,
                chartid: chartid
            }, function (data) {
                chartworkflowdetail = data['chartworkflowdetail'];
                $('#chartWorkflowModal').modal('toggle');
                $('#chartWorkflowModalLabel').html('Workflow of ' + chartworkflowdetail.workflowType);
                //  setTimeout(function() {
                //      chartcanvasNetwork.fit();
                //      chartlegendNetwork.fit();
                // }, 3000);


            });
        });
    });


    $('#chartWorkflowModal').on('shown.bs.modal', function () {
        bindWorkflow(chartworkflowdetail, true);
        chartcanvasNetwork.fit();
        chartlegendNetwork.fit();
        $("#divChartWorkflow").css('visibility', 'visible');
        $("#divChartLegend").css('visibility', 'visible');


    });

    $(document).on('show.bs.modal', '.modal', function (event) {
        var zIndex = 1040 + (10 * $('.modal:visible').length);
        $(this).css('z-index', zIndex);
        setTimeout(function () {
            $('.modal-backdrop').not('.modal-stack').css('z-index', zIndex - 1).addClass('modal-stack');
        }, 0);
    });

    window.onresize = function () {
        chartcanvasNetwork.fit();
    };
    window.onresize = function () {
        chartlegendNetwork.fit();
    }

// $('.modal-content').resizable({
//     chartcanvasNetwork = null;
//     chartlegendNetwork.fit();
//     //alsoResize: ".modal-dialog",
//     //minHeight: 150
// });


});


//Builds first half of page i.e. paper details
function buildPaperInfo(paperDetails) {
    //title
    console.log(paperDetails);
    $("#lblTitle").html(paperDetails._PaperDetails__title);

    //authors
    var authors = "by ";
    $.each(paperDetails._PaperDetails__authors, function (i, item) {
        authors += item.firstName + " " + item.lastName + ", ";
    });
    authors = authors.replace(/,\s*$/, "");
    $("#lblAuthor").html(authors);

    //cite
    if (paperDetails._PaperDetails__cite != "") {
        $("#lblDOI").html("<a target='_blank' href='http://DOI.org/"
            + paperDetails._PaperDetails__cite
            + "' title='"
            + paperDetails._PaperDetails__title
            + "'>"
            + paperDetails._PaperDetails__cite
            + "</a>");
    }

    //abstract
    $("#lblPaperAbstract").html(paperDetails._PaperDetails__abstract);
    localStorage.setItem("description", paperDetails._PaperDetails__abstract);

    //publication
    var year = paperDetails._PaperDetails__year;
    var journal = "<a target='_blank' href='http://DOI.org/" + paperDetails._PaperDetails__doi + "'>" + paperDetails._PaperDetails__publication + " (" + year + ") </a>";
    $("#lblPublishedIn").html(journal);

    //collections
    $("#lblCollection").html(paperDetails._PaperDetails__collections);

    //tags
    temp = "";
    localStorage.setItem("tags", paperDetails._PaperDetails__tags);
    var tags = "<ul class='tags'>";
    $.each(paperDetails._PaperDetails__tags, function (index, item) {
        item = $.trim(item);
        var tag = '<li><a href="#" class="tag">' + item + '</a></li>';
        tags += tag;
    });
    tags += "</ul>";
    $("#lblTags").html(tags);

    //cite
    var CiteDiv = $("#PaperSection");
    if ((paperDetails._PaperDetails__cite != undefined && paperDetails._PaperDetails__cite != null && paperDetails._PaperDetails__cite != "")) {
        var figshare = paperDetails._PaperDetails__cite;
        var doitext = "<div id='doiText'  class='paper-col-info'><label style='float: left'>Cite: &nbsp;</label><p style='float: left'>" + figshare + "</p></div>";
        CiteDiv.append(doitext);
    } else {
        var MintBtn = "<div id='btnMint' class='paper-col-info'><label style='float: left'>Cite: &nbsp;</label><p style='float: left'><input type='button' name='general_mint_button' value='Mint DOI' class='btn btn-theme-colored m-1' style='font-weight: bold; margin:0; padding:4px; font-size:10px;'></p></div>";
        CiteDiv.append(MintBtn);
    }

    //download
    if (paperDetails._PaperDetails__downloadPath != undefined && paperDetails._PaperDetails__downloadPath != null && paperDetails._PaperDetails__downloadPath != "") {
        var downloadBtn = "<div class='paper-col-info'><label style='float: left'>Download: &nbsp;</label><p style='float: left'><a href='" + paperDetails._PaperDetails__downloadPath + "' title='Download the data source for the chart from this Endpoint' target='_blank'><i class='fa fa-download' style='font-size:20px;'></i></a></p></div>";
        CiteDiv.append(downloadBtn);
    }

    //notebook
    if (paperDetails._PaperDetails__notebookPath != undefined && paperDetails._PaperDetails__notebookPath != null && paperDetails._PaperDetails__notebookPath != "") {

        var notebookPath = paperDetails._PaperDetails__notebookPath;
        if (notebookPath != "") {
            if (notebookPath.indexOf('notebooks') < 0) {
                notebookPath = notebookPath.replace(/^(https?:\/\/)?(www\.)?/, '');
                notebookPath = "https://nbviewer.jupyter.org/url/" + notebookPath;
            }
        }
        if (paperDetails._PaperDetails__notebookFile != undefined && paperDetails._PaperDetails__notebookFile != null && paperDetails._PaperDetails__notebookFile != "") {
            notebookPath = notebookPath + "/" + paperDetails._PaperDetails__notebookFile;
        }

        var notebookBtn = "<div class='paper-col-info'> <label style='float: left'>Notebook: &nbsp;</label><p style='float: left'> <a href='" + notebookPath + "' title='View the Jupyter Notebook' target='_blank'> <img src='/static/images/jupyter.png' alt='jupyter' style='width:20px;'></a></p></div>";
        CiteDiv.append(notebookBtn);
    }
    buildChartTables(paperDetails._PaperDetails__charts, paperDetails)
}

function buildChartTables(chartDetails, paperDetails) {
    var tableCharts = $('#tblcharts')
        .DataTable(
            {
                "processing": true,
                "serverSide": false,
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
                        "searchable": false,
                        "render": function (data, type, row) {
                            console.log(row);
                            var chartInfo = "<div class='span2'><a rel='prettyPhoto' title='" + $.trim(row.kind) + " "
                                + $.trim(row.number)
                                + ": "
                                + $.trim(row.caption)
                                + "' href='"
                                + $
                                    .trim(paperDetails._PaperDetails__fileServerPath)
                                + "/"
                                + $.trim(row.imageFile)
                                + "' class='thumbnail hover_icon'><img data-original='"
                                + $
                                    .trim(paperDetails._PaperDetails__fileServerPath)
                                + "/"
                                + $.trim(row.imageFile)
                                + "' class='img-responsive img-thumbnail lazy' alt='"
                                + $.trim(row.caption)
                                + "' title='"
                                + $.trim(row.caption)
                                + "' style='background-image: url(/static/images/transparent.gif);' ></a><div class='text-center'><h6>"
                                + $.trim(row.kind) + " "
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
                                    .trim(paperDetails._PaperDetails__fileServerPath)
                                + "/"
                                + imageName
                                + "' title='View the Data Tree' target='_blank'><img src='/static/images/datatree.png' alt='datatree'></a></li>";

                            var notebookPath = $.trim(paperDetails._PaperDetails__notebookPath);
                            if (notebookPath != "") {
                                if (notebookPath.indexOf('notebooks') < 0) {
                                    notebookPath = notebookPath.replace(/^(https?:\/\/)?(www\.)?/, '');
                                    notebookPath = "http://nbviewer.jupyter.org/url/" + notebookPath;
                                }
                            }
                            var notebooks = ($
                                .trim(paperDetails._PaperDetails__notebookFile) == "") ? ""
                                : "<li><a href='"
                                + notebookPath
                                + "/"
                                + $
                                    .trim(paperDetails._PaperDetails__notebookFile)
                                + "' title='View the Jupyter Notebook' target='_blank' ><img src='/static/images/jupyter.png' alt='jupyter'></a></li>";

                            var downloads = ($
                                .trim(paperDetails._PaperDetails__downloadPath) == "") ? ""
                                : "<li><a href='"
                                + $
                                    .trim(paperDetails._PaperDetails__downloadPath)
                                + "' title='Download the data source for the chart from this Endpoint' target='_blank'><img src='/static/images/download-icon.png' alt='download'></a></li>";

                            var workflows = ($
                                .trim(paperDetails._PaperDetails__id) == "") ? ""
                                : "<li><a href='javascript:void'><img data-workflow='"
                                + paperDetails._PaperDetails__id
                                + ","
                                + $.trim(row.id)
                                + "' src='/static/images/workflow.png' data-toggle='modal' data-target='#chartWorkflowModalMode' class='workflowimg' alt='workflow'></a></li>";

                            // var workflows = "<img data-workflow='"
                            //     + paperDetails._PaperDetails__id
                            //     + ","
                            //     + $.trim(row.id)
                            //     + "' src='/static/images/workflow.png' data-toggle='modal' data-target='#examplemodal' class='workflowimg' style='height: 35px; width: 35px; cursor: pointer;' alt='workflow'>";

                            chartInfo += datatree + workflows +downloads + notebooks + "</ul></div>";
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
                        "data": "properties[, ]",
                        "width": "20%",
                        "searchable": true,
                        "visible": true
                    },
                    {
                        "data": "kind",
                        "visible": false,
                        "searchable": false,
                        "sortable": false,
                    },
                    {
                        "data": "files",
                        "render": function (data, type, row) {
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
                                                .trim(paperDetails._PaperDetails__fileServerPath)
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
                        "width": "30%",
                        "searchable": true

                    }],
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
    buildDatasetTables(paperDetails._PaperDetails__datasets, paperDetails)
}

function buildDatasetTables(datasetDetails, paperDetails) {
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
                        "width": "60%"
                    },
                    {
                        "data": "files",
                        "title": "Files",
                        "visible": true,
                        "width": "40%",
                        "render": function (data, type, row) {
                            var filesLink = "<div class='span2'>";
                            $.each(data, function (index, item) {
                                var file = $.trim(item);
                                var fileName = (file == "") ? ""
                                    : file
                                        .substring(file
                                            .lastIndexOf("/") + 1);

                                filesLink += "<a href='"
                                    + $
                                        .trim(paperDetails._PaperDetails__fileServerPath)
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

                    }],
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
}


function bindWorkflow(workflowDetails, isChart) {
    var colors = {
        "red": "h",
        "blue": "t",
        "gray": "d",
        "green": "s",
        "orange": "c"
        //, "pink" : "n"
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
    };

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
    };

    var DotSelection = function (value) {
        switch (value) {
            case colors.red:
                return 20;
                break;
            default:
                return 35;

        }
    };

    var hasPath = function (var1, var2) {
        var flag = false;
        $.each(workflowDetails, function (key, value) {
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
        });
        return flag;
    };

    // create an array with nodes
    var nodes = new vis.DataSet();

    // create an array with edges
    var edges = new vis.DataSet();


    // create a network
    var container = "";
    if (isChart) {
        container = document.getElementById('divChartWorkflow');
    } else {
        container = document.getElementById('divWorkflow');
    }

    var options = {

        autoResize: true,
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
        nodes: {
            shape: 'dot'
        },
        physics: {
            minVelocity: 0.75
        },
        interaction: {
            hover: true
        }
    };

    $.each(workflowDetails, function (key, value) {
        var counter = 1000;
        if (key == "nodes") {
            //NODES
            $.each(value, function (index, val) {
                nodes.add([{
                    id: index,
                    //label : '<b>' + val.nodelabel + '</b>',
                    shape: ShapeSelection(index.charAt(0)),
                    size: DotSelection(index.charAt(0)),
                    color: ColorSelection(index.charAt(0)),
                    title: val.toolTip,
                    info: val.details,
                    chosen: {
                        label: false,
                        node: changeChosenNodeSize
                    },
                    font: {
                        multi: true,
                        size: 25,
                        color: FontColorSelection(index.charAt(0)),
                        bold: {
                            //color : '#7da60f'
                            color: FontColorSelection(index.charAt(0))
                        }
                    }
                }]);
            });
        } else if (key == "edges") {
            //EDGES
            $.each(value, function (item, val) {
                edges.add([{
                    from: val[0],
                    to: val[1]
                }]);
            })
        } else if (key == "workflowType") {
            //Info
            $('#workflowFor').html('Workflow of ' + value);
        }

    });

    var data = {
        nodes: nodes,
        edges: edges
    };

    if (isChart) {
        chartcanvasNetwork = new vis.Network(container, data, options);
        container.getElementsByTagName("canvas")[0].style.cursor = 'pointer';

        chartcanvasNetwork.on("click", function (params) {
            var node = nodes.get(params.nodes);

            if (node.length != 0) {
                if (node[0].info !== '' && node[0].info !== undefined) {
                    $('.vis-tooltip').css('visibility', 'hidden');
                    bindModal(node[0].info);
                } else if (node[0].type !== '' && node[0].type !== undefined) {
                    if (node[0].link !== '') {
                        window.open(node[0].link, '_blank');
                    }

                }

            }

        });
        chartcanvasNetwork.fit();
    } else {
        canvasNetwork = new vis.Network(container, data, options);
        container.getElementsByTagName("canvas")[0].style.cursor = 'pointer';

        canvasNetwork.on("click", function (params) {
            var node = nodes.get(params.nodes);

            if (node.length != 0) {
                if (node[0].info !== '' && node[0].info !== undefined) {
                    $('.vis-tooltip').css('visibility', 'hidden');
                    bindModal(node[0].info);
                } else if (node[0].type !== '' && node[0].type !== undefined) {
                    if (node[0].link !== '') {
                        window.open(node[0].link, '_blank');
                    }

                }

            }

        });
        canvasNetwork.fit();
    }
    // create an array with nodes
    var legendNodes = new vis.DataSet();

    // create an array with edges
    var legendEdges = new vis.DataSet();

    // legend
    var mynetwork = "";
    if (isChart) {
        mynetwork = document.getElementById('divChartLegend');
    } else {
        mynetwork = document.getElementById('divLegend');
    }
    var x = -mynetwork.clientWidth / 2 + 50;
    var y = -mynetwork.clientHeight / 1.5 + 20;
    var step = 95;
    legendNodes.add({
        id: 1000,
        x: x + 10,
        y: y + step + 30,
        label: 'Nodes',
        shape: 'text',
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
    legendNodes
        .add({
            id: 1001,
            x: x,
            y: y + 2 * step,
            label: 'External',
            group: 'External',
            title: '<b>External:</b><br>The external node represents content that was used within the paper, but not generated within the paper. A reference/link is not required but recommended.',
            size: 10,
            shape: 'dot',
            color: 'red',
            fixed: true,
            physics: false,
            chosen: {
                label: false,
                node: changeChosenLegendNodeSize
            }
        });

    legendNodes
        .add({
            id: 1002,
            x: x,
            y: y + 3 * step,
            label: 'Dataset',
            group: 'Dataset',
            title: '<b>Dataset:</b><br>The dataset node represents data generated by either a Tool or Script node.',
            color: 'gray',
            size: 20,
            shape: 'dot',
            fixed: true,
            physics: false,
            chosen: {
                label: false,
                node: changeChosenLegendNodeSize
            }
        });
    legendNodes
        .add({
            id: 1003,
            x: x,
            y: y + 4 * step,
            label: 'Script',
            group: 'Script',
            title: '<b>Script:</b><br>The script node represents user-defined procedures utilized in the paper (e.g. to analyze or post-process data belonging to datasets).',
            color: 'green',
            shape: 'triangle',
            size: 20,
            fixed: true,
            physics: false,
            chosen: {
                label: false,
                node: changeChosenLegendNodeSize
            }
        });

    legendNodes
        .add({
            id: 1004,
            x: x,
            y: y + 5 * step,
            label: 'Tool',
            group: 'Tool',
            title: '<b>Tool:</b><br>The tool node represents an instrument (either software or experimental set up) utilized in the paper.',
            size: 20,
            color: 'blue',
            shape: 'diamond',
            fixed: true,
            physics: false,
            chosen: {
                label: false,
                node: changeChosenLegendNodeSize
            }
        });
    legendNodes
        .add({
            id: 1005,
            x: x,
            y: y + 6 * step,
            label: 'Chart',
            group: 'Chart',
            title: '<b>Chart:</b><br>The chart node represents a figure or a table, and is typically considered an end-point within the workflow.',
            color: 'orange',
            shape: 'square',
            size: 20,
            fixed: true,
            physics: false,
            chosen: {
                label: false,
                node: changeChosenLegendNodeSize
            }
        });

    var data = {
        nodes: legendNodes,
        edges: legendEdges
    };

    options.interaction.zoomView = false;
    options.interaction.dragView = false;
    options.interaction.dragNodes = false;
    chartlegendNetwork = new vis.Network(mynetwork, data, options);
    if (isChart) {
        mynetwork.getElementsByTagName("canvas")[0].style.cursor = 'pointer';
        chartlegendNetwork.fit();
    } else {
        legendNetwork = new vis.Network(mynetwork, data, options);
        mynetwork.getElementsByTagName("canvas")[0].style.cursor = 'pointer';
    }
}

function createGoogleDatasetsScript(paperDetails){
     var auth = []
     $.each(paperDetails._PaperDetails__authors, function(i,item) {
         var name = item.firstName + " "+ item.lastName;
         auth.push({"@type":"Person","name":name});
     });
     var value = {
         "@context": "http://schema.org/",
         "@type": "Dataset",
         "dateCreated": paperDetails._PaperDetails__timeStamp,
         "name": paperDetails._PaperDetails__title,
         "description": paperDetails._PaperDetails__abstract,
         "url": window.location.href,
         "keywords": paperDetails._PaperDetails__tags,
         "publisher": {"@type": "Organization","name": "Qresp"},
         "creator": auth,
         "version":"1",
         "identifier":paperDetails._PaperDetails__cite
     };
     var script = document.createElement('script');
     script.type = 'application/ld+json';
     script.innerHTML = JSON.stringify(value);
     document.getElementsByTagName('head')[0].appendChild(script);
}
