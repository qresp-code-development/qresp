var queryString = window.location.search.slice(1).split("=");
var servers = "";
if (queryString.includes("servers")) {
    servers = queryString[1];
}
$(function () {
    // Add minus icon for collapse element which is open by default
    $(".collapse.show").each(function () {
        $(this)
            .prev(".card-header")
            .find(".fa-angle-down")
            .addClass("fa-angle-up")
            .removeClass("fa-angle-down");
    });

    // Toggle plus minus icon on show hide of collapse element
    $(".collapse")
        .on("show.bs.collapse", function () {
            $(this)
                .prev(".card-header")
                .find(".fa-angle-down")
                .removeClass("fa-angle-down")
                .addClass("fa-angle-up");
        })
        .on("hide.bs.collapse", function () {
            $(this)
                .prev(".card-header")
                .find(".fa-angle-up")
                .removeClass("fa-angle-up")
                .addClass("fa-angle-down");
        });

    $("#PaperSection").on("click", "#btnMint", function () {
        window.location.href = "/mint";
        return false;
    });
    $("#PaperSection").on("click", "#btnCite", function () {
        $(this).toggle();
        $(this).next("#doiText").toggle();
    });

    var chartworkflowdetail = null;

    $(".workflowimg").each(function () {
        var $this = $(this);
        var url = "/chartworkflow";
        $this.on("click", function () {
            var values = $(this).data("workflow");
            var strvalues = values.split(",");
            var paperid = strvalues[0];
            var chartid = strvalues[1];
            if (isPreviewSection) {
                url = "/previewchartworkflow";
            }
            $.getJSON(
                url,
                {
                    paperid: paperid,
                    chartid: chartid,
                    servers: servers,
                },
                function (data) {
                    chartworkflowdetail = data["chartworkflowdetail"];
                    $("#chartWorkflowModal").modal("show");
                    $("#chartWorkflowModalLabel").html(
                        "Workflow of " + chartworkflowdetail.workflowType
                    );
                    bindWorkflow(chartworkflowdetail, true);
                }
            );
        });
    });

    $(document).on("click", ".button-icon", function () {
        $(this).toggleClass("active");
        $(this).next(".icons-charts").toggleClass("open");
    });
});

$(document).on("show.bs.modal", ".modal", function (event) {
    var zIndex = 1040 + 10 * $(".modal:visible").length;
    $(this).css("z-index", zIndex);
    setTimeout(function () {
        $(".modal-backdrop")
            .not(".modal-stack")
            .css("z-index", zIndex - 1)
            .addClass("modal-stack");
    }, 0);
});

//Builds first half of page i.e. paper details
function buildPaperInfo(paperDetails) {

    // Storing Data required for Minting DOIs
    localStorage.setItem("paperId", paperDetails.id)
    localStorage.setItem("title", paperDetails.title)
    localStorage.setItem("description", paperDetails.abstract)
    localStorage.setItem("tags", paperDetails.tags.join(','))
    localStorage.setItem("link", window.location.protocol + "//" + window.location.host + window.location.pathname)

    if (paperDetails && paperDetails.title && paperDetails.authors) {
        //title
        $("#lblTitle").html(paperDetails.title);
        //authors
        var authors = "by " + paperDetails.authors;
        $("#lblAuthor").html(authors);

        //cite
        if (paperDetails.cite != "") {
            $("#lblDOI").html(
                "<a target='_blank' href='http://DOI.org/" +
                paperDetails.cite +
                "' title='" +
                paperDetails.title +
                "'>" +
                paperDetails.cite +
                "</a>"
            );
        }

        //abstract
        $("#lblPaperAbstract").html(paperDetails.abstract);
        //publication
        var year = paperDetails.year;
        var journal =
            "<a target='_blank' href='http://DOI.org/" +
            paperDetails.doi +
            "'>" +
            paperDetails.publication +
            " (" +
            year +
            ") </a>";
        $("#lblPublishedIn").html(journal);

        //collections
        $("#lblCollection").html(paperDetails.collections);

        //tags
        temp = "";
        var tags = "<ul class='tags'>";
        $.each(paperDetails.tags, function (index, item) {
            item = $.trim(item);
            var tag = '<li><a href="#" class="tag">' + item + "</a></li>";
            tags += tag;
        });
        tags += "</ul>";
        $("#lblTags").html(tags);

        // PIs
        $("#lblInfoPIs").html(paperDetails.PIs);

        var papersection = $("#PaperSection");
        // cite
        if (
            paperDetails.cite != undefined &&
            paperDetails.cite != null &&
            paperDetails.cite != ""
        ) {
            var figshare = paperDetails.cite;
            var doitext =
                "<div id='doiText'  class='paper-col-info'><label style='float: left'>Cite: &nbsp;</label><p style='float: left'>" +
                figshare +
                "</p></div>";
            papersection.append(doitext);
        } else {
            var MintBtn =
                "<div id='btnMint' class='paper-col-info'><label style='float: left'>Cite: &nbsp;</label><p style='float: left'><input type='button' name='general_mint_button' value='Mint DOI' class='btn btn-theme-colored m-1' style='font-weight: bold; margin:0; padding:4px; font-size:10px;'></p></div>";
            papersection.append(MintBtn);
        }

        // download
        if (
            paperDetails.downloadPath != undefined &&
            paperDetails.downloadPath != null &&
            paperDetails.downloadPath != ""
        ) {
            var downloadBtn =
                "<div class='paper-col-info'><label style='float: left'>Download: &nbsp;</label><p style='float: left'><a href='" +
                paperDetails.downloadPath +
                "' title='Download the data source for the chart from this Endpoint' target='_blank'><i class='fa fa-download' style='font-size:20px;'></i></a></p></div>";
            papersection.append(downloadBtn);
        }

        //notebook
        if (
            paperDetails.notebookPath != undefined &&
            paperDetails.notebookPath != null &&
            paperDetails.notebookPath != ""
        ) {
            var notebookPath = paperDetails.fileServerPath;
            if (notebookPath != "") {
                notebookPath = notebookPath.replace(/^(https?:\/\/)?(www\.)?/, "");
                notebookPath = "https://nbviewer.jupyter.org/url/" + notebookPath;
            }
            if (
                paperDetails.notebookFile != undefined &&
                paperDetails.notebookFile != null &&
                paperDetails.notebookFile != ""
            ) {
                notebookPath = notebookPath + "/" + paperDetails.notebookFile;
            }
            var notebookBtn =
                "<div class='paper-col-info'> <label style='float: left'>Notebook: &nbsp;</label><p style='float: left'> <a href='" +
                notebookPath +
                "' title='View the Jupyter Notebook' target='_blank'> <img src='/static/images/jupyter.png' alt='jupyter' style='width:20px;'></a></p></div>";
            papersection.append(notebookBtn);
        }
    } else {
        $("#showProjectInfo").hide();
    }

    // Server Information
    if (paperDetails.fileServerPath) {
        $("#lblProject").html(paperDetails.fileServerPath);
    } else {
        $("#showServer").hide();
    }

    // Curator Information
    if (paperDetails.firstName) {
        var fullname = paperDetails.middleName
            ? paperDetails.firstName +
            " " +
            paperDetails.middleName +
            " " +
            paperDetails.lastName
            : paperDetails.firstName + " " + paperDetails.lastName;
        $("#lblCuratorName").html(fullname);
        $("#lblCuratorEmail").html(paperDetails.emailId);
        $("#lblCuratorAffiliation").html(paperDetails.affiliation);
    } else {
        $("#showCurator").hide();
    }

    //documentation Information
    if (paperDetails.documentation) {
        $("#lblReadme").html(paperDetails.documentation);
    } else {
        $("#showDocumentation").hide();
    }
}

function buildChartTables(chartDetails, paperDetails) {
    if (chartDetails && chartDetails.length > 0) {
        var tableCharts = $("#tblcharts").DataTable({
            processing: true,
            serverSide: false,
            destroy: true,
            data: chartDetails,
            lengthMenu: [
                [10, 25, 50, 100, 500, -1],
                [10, 25, 50, 100, 500, "All"],
            ],
            pageLength: 10,
            deferRender: true,
            scrollX: true,
            responsive: true,
            autoWidth: false,
            columns: [
                {
                    data: "id",
                    visible: false,
                    searchable: false,
                    sortable: false,
                },
                {
                    data: "imageFile",
                    visible: false,
                    searchable: false,
                    sortable: false,
                },
                {
                    data: null,
                    sortable: false,
                    searchable: false,
                    render: function (data, type, row) {
                        var chartInfo =
                            "<div class='span2'><a rel='prettyPhoto' title='" +
                            $.trim(row.number) +
                            ": " +
                            $.trim(row.caption) +
                            "' href='" +
                            $.trim(paperDetails.fileServerPath) +
                            "/" +
                            $.trim(row.imageFile) +
                            "' class='thumbnail hover_icon'><img data-original='" +
                            $.trim(paperDetails.fileServerPath) +
                            "/" +
                            $.trim(row.imageFile) +
                            "' class='img-responsive img-thumbnail lazy' alt='" +
                            $.trim(row.caption) +
                            "' title='" +
                            $.trim(row.caption) +
                            "' style='background-image: url(/static/images/transparent.gif);' ></a><div class='text-center'><h6>" +
                            " " +
                            $.trim(row.number) +
                            "</h6></div></div>";

                        chartInfo +=
                            "<div id='toolbar'><div style='width: 100%; float: left; margin-bottom: 15px;'>";
                        chartInfo += "<div class='button-icon'></div>";
                        chartInfo += "<ul class='icons-charts'>";
                        var imageFileName = $.trim(row.imageFile);
                        var lastSlash = imageFileName.lastIndexOf("/");
                        var imageName =
                            lastSlash > 0
                                ? imageFileName.substring(0, imageFileName.lastIndexOf("/"))
                                : "";
                        var datatree =
                            imageFileName == ""
                                ? ""
                                : "<li><a href='" +
                                $.trim(paperDetails.fileServerPath) +
                                "/" +
                                imageName +
                                "' title='View the Data Tree' target='_blank'><img src='/static/images/datatree.png' alt='datatree'></a></li>";

                        var notebookPath = $.trim(paperDetails.fileServerPath);
                        if (notebookPath != "") {
                            notebookPath = notebookPath.replace(
                                /^(https?:\/\/)?(www\.)?/,
                                ""
                            );
                            notebookPath = "http://nbviewer.jupyter.org/url/" + notebookPath;
                        }
                        var notebooks =
                            $.trim(row.notebookFile) == ""
                                ? ""
                                : "<li><a href='" +
                                notebookPath +
                                "/" +
                                $.trim(row.notebookFile) +
                                "' title='View the Jupyter Notebook' target='_blank' ><img src='/static/images/jupyter.png' alt='jupyter'></a></li>";

                        var downloads =
                            $.trim(paperDetails.downloadPath) == ""
                                ? ""
                                : "<li><a href='" +
                                $.trim(paperDetails.downloadPath) +
                                "' title='Download the data source for the chart from this Endpoint' target='_blank'><img src='/static/images/download-icon.png' alt='download'></a></li>";

                        var workflows =
                            $.trim(paperDetails.id) == ""
                                ? ""
                                : "<li><a href='javascript:void'><img data-workflow='" +
                                paperDetails.id +
                                "," +
                                $.trim(row.id) +
                                "' src='/static/images/workflow.png' data-toggle='modal' data-target='#chartWorkflowModal' class='workflowimg' alt='workflow'></a></li>";

                        // var workflows = "<img data-workflow='"
                        //     + paperDetails.id
                        //     + ","
                        //     + $.trim(row.id)
                        //     + "' src='/static/images/workflow.png' data-toggle='modal' data-target='#examplemodal' class='workflowimg' style='height: 35px; width: 35px; cursor: pointer;' alt='workflow'>";

                        chartInfo +=
                            datatree + workflows + downloads + notebooks + "</ul></div>";
                        return chartInfo;
                    },
                    width: "50%",
                },
                {
                    data: "number",
                    visible: false,
                    sortable: false,
                    searchable: false,
                },
                {
                    data: "caption",
                    visible: false,
                    sortable: false,
                    searchable: false,
                },
                {
                    data: "properties[, ]",
                    width: "20%",
                    searchable: true,
                    visible: true,
                },
                {
                    data: "files",
                    render: function (data, type, row) {
                        var filesLink = "<div class='span2'>";
                        $.each(data, function (index, item) {
                            var file = $.trim(item);
                            var fileName =
                                file == "" ? "" : file.substring(file.lastIndexOf("/") + 1);

                            filesLink +=
                                "<a href='" +
                                $.trim(paperDetails.fileServerPath) +
                                "/" +
                                file +
                                "' title='Click to view " +
                                fileName +
                                "' target='_blank'>" +
                                fileName +
                                "</a>, ";
                        });
                        filesLink = filesLink.replace(/,\s*$/, "");
                        return filesLink;
                    },
                    width: "30%",
                    searchable: true,
                },
            ],
            search: {
                // "search" : "Type here...",
                caseInsensitive: true,
                regex: false,
                smart: true,
            },
            drawCallback: function () {
                $("#divCharts").show();
                $("a[rel^='prettyPhoto']").prettyPhoto({
                    show_title: false,
                    social_tools: "",
                }); // , theme: 'facebook'

                $("img.lazy").lazyload({
                    effect: "fadeIn",
                    skip_invisible: true,
                });
            },
        });
    } else {
        $("#showChart").hide();
    }
}

function buildDatasetTables(datasetDetails, paperDetails) {
    if (datasetDetails && datasetDetails.length > 0) {
        var tableDatasets = $("#tbldatasets").DataTable({
            processing: true,
            serverSide: false,
            destroy: true,
            data: datasetDetails,
            lengthMenu: [
                [10, 25, 50, 100, 500, -1],
                [10, 25, 50, 100, 500, "All"],
            ],
            pageLength: 10,
            deferRender: true,
            responsive: true,
            autoWidth: false,
            columns: [
                {
                    data: "id",
                    visible: false,
                    searchable: false,
                    sortable: false,
                },
                {
                    data: "readme",
                    title: "Description",
                    visible: true,
                    width: "60%",
                },
                {
                    data: "files",
                    title: "Files",
                    visible: true,
                    width: "40%",
                    render: function (data, type, row) {
                        var filesLink = "<div class='span2'>";
                        $.each(data, function (index, item) {
                            var file = $.trim(item);
                            var fileName =
                                file == "" ? "" : file.substring(file.lastIndexOf("/") + 1);

                            filesLink +=
                                "<a href='" +
                                $.trim(paperDetails.fileServerPath) +
                                "/" +
                                file +
                                "' title='Click to view " +
                                fileName +
                                "' target='_blank'>" +
                                fileName +
                                "</a>, ";
                        });
                        filesLink = filesLink.replace(/,\s*$/, "");
                        return filesLink;
                    },
                    searchable: true,
                },
            ],
            search: {
                // "search" : "Type here...",
                caseInsensitive: true,
                regex: false,
                smart: true,
            },
            drawCallback: function () {
                $("#divCharts").show();
                $("a[rel^='prettyPhoto']").prettyPhoto({
                    show_title: false,
                    social_tools: "",
                }); // , theme: 'facebook'

                $("img.lazy").lazyload({
                    effect: "fadeIn",
                    skip_invisible: true,
                });
            },
        });
    } else {
        $("#showDataset").hide();
    }
}

function buildScriptTables(scriptDetails, paperDetails) {
    if (scriptDetails && scriptDetails.length > 0) {
        var tableScripts = $("#tblscripts").DataTable({
            processing: true,
            serverSide: false,
            destroy: true,
            data: scriptDetails,
            lengthMenu: [
                [10, 25, 50, 100, 500, -1],
                [10, 25, 50, 100, 500, "All"],
            ],
            pageLength: 10,
            deferRender: true,
            responsive: true,
            autoWidth: false,
            columns: [
                {
                    data: "id",
                    visible: false,
                    searchable: false,
                    sortable: false,
                },
                {
                    data: "readme",
                    title: "Description",
                    visible: true,
                    width: "50%",
                },
                {
                    data: "files",
                    title: "Files",
                    visible: true,
                    width: "50%",
                    render: function (data, type, row) {
                        var filesLink = "<div class='span2'>";
                        $.each(data, function (index, item) {
                            var file = $.trim(item);
                            var fileName =
                                file == "" ? "" : file.substring(file.lastIndexOf("/") + 1);

                            filesLink +=
                                "<a href='" +
                                $.trim(paperDetails.fileServerPath) +
                                "/" +
                                file +
                                "' title='Click to view " +
                                fileName +
                                "' target='_blank'>" +
                                fileName +
                                "</a>, ";
                        });
                        filesLink = filesLink.replace(/,\s*$/, "");
                        return filesLink;
                    },
                    searchable: true,
                },
            ],
            search: {
                caseInsensitive: true,
                regex: false,
                smart: true,
            },
        });
    } else {
        $("#showScript").hide();
    }
}

function buildToolTables(toolDetails) {
    if (toolDetails && toolDetails.length > 0) {
        var tableTools = $("#tbltools").DataTable({
            processing: true,
            serverSide: false,
            destroy: true,
            data: toolDetails,
            lengthMenu: [
                [10, 25, 50, 100, 500, -1],
                [10, 25, 50, 100, 500, "All"],
            ],
            pageLength: 10,
            deferRender: true,
            responsive: true,
            autoWidth: false,
            columns: [
                {
                    data: "id",
                    visible: false,
                    searchable: false,
                    sortable: false,
                },
                {
                    data: "kind",
                    visible: true,
                    searchable: true,
                    width: "30%",
                },
                {
                    data: null,
                    visible: true,
                    searchable: true,
                    render: function (data, type, row) {
                        var divblock = "<div id='instrument'>";
                        var softwareblock = "<div id='software-details'>";
                        var experimentblock = "<div id='experiment-details'>";
                        if (row.packageName && row.version) {
                            softwareblock =
                                softwareblock +
                                "<b> Package Name: </b> " +
                                row.packageName +
                                "<br/> <b> Version: </b> " +
                                row.version +
                                "</div>";
                        } else if (row.facilityName && row.measurement) {
                            experimentblock =
                                experimentblock +
                                "<b> Facility Name: </b> " +
                                row.facilityName +
                                "<br/> <b> Measurement: </b> " +
                                row.measurement +
                                "</div>";
                        }
                        return divblock + softwareblock + experimentblock + "</div>";
                    },
                    width: "70%",
                },
            ],
            search: {
                caseInsensitive: true,
                regex: false,
                smart: true,
            },
        });
    } else {
        $("#showTool").hide();
    }
}

var bindModal = function (info) {
    $("#workflowModalLabel").html(info[0]);
    // $('#workflowModalLabel').css('position', 'absolute');
    $("#workflowModalBody").html(info[1]);
    $("#workflowModal").modal("show");
};

var changeChosenNodeSize = function (values, id, selected, hovering) {
    values.size = 30;
};

var changeChosenLegendNodeSize = function (values, id, selected, hovering) {
    values.size = 23;
};

var changeChosenEdgeMiddleArrowScale = function (
    values,
    id,
    selected,
    hovering
) {
    values.middleArrowScale = 1.1;
};

var canvasNetwork = null;
var legendNetwork = null;
var chartcanvasNetwork = null;
var chartlegendNetwork = null;

function bindWorkflow(workflowDetails, isChart) {
    if (workflowDetails && workflowDetails.edges.length > 0) {
        var colors = {
            red: "h",
            blue: "t",
            gray: "d",
            green: "s",
            orange: "c",
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
                    return 10;
                    break;
                default:
                    return 23;
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
                    });
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
            container = document.getElementById("divChartWorkflow");
        } else {
            container = document.getElementById("divWorkflow");
        }

        var options = {
            edges: {
                // color: 'black',
                arrows: {
                    middle: true,
                    // 					{
                    // 						scaleFactor : 0.6
                    // 					}
                },
                chosen: {
                    label: false,
                    edge: changeChosenEdgeMiddleArrowScale,
                },
            },
            // nodes: {
            //     shape: 'dot'
            // },
            physics: {
                minVelocity: 0.75,
            },
            interaction: {
                hover: true,
                dragNodes: true,
            },
            layout: {
                improvedLayout: true,
                randomSeed: undefined,
            },
        };

        $.each(workflowDetails, function (key, value) {
            var counter = 1000;
            if (key == "nodes") {
                //NODES
                $.each(value, function (index, val) {
                    nodes.add([
                        {
                            id: index,
                            //label : '<b>' + val.nodelabel + '</b>',
                            shape: ShapeSelection(index.charAt(0)),
                            size: DotSelection(index.charAt(0)),
                            color: ColorSelection(index.charAt(0)),
                            title: val.toolTip,
                            info: val.details,
                            chosen: {
                                label: false,
                                node: changeChosenNodeSize,
                            },
                            font: {
                                multi: true,
                                size: 25,
                                color: FontColorSelection(index.charAt(0)),
                                bold: {
                                    //color : '#7da60f'
                                    color: FontColorSelection(index.charAt(0)),
                                },
                            },
                        },
                    ]);
                });
            } else if (key == "edges") {
                //EDGES
                $.each(value, function (item, val) {
                    edges.add([
                        {
                            from: val[0],
                            to: val[1],
                        },
                    ]);
                });
            } else if (key == "workflowType") {
                //Info
                $("#workflowFor").html("Workflow of " + value);
            }
        });

        var data = {
            nodes: nodes,
            edges: edges,
        };

        if (isChart) {
            try {
                chartcanvasNetwork = new vis.Network(container, data, options);
                container.getElementsByTagName("canvas")[0].style.cursor = "pointer";

                chartcanvasNetwork.on("click", function (params) {
                    var node = nodes.get(params.nodes);

                    if (node.length != 0) {
                        if (node[0].info !== "" && node[0].info !== undefined) {
                            $(".vis-tooltip").css("visibility", "hidden");
                            bindModal(node[0].info);
                        } else if (node[0].type !== "" && node[0].type !== undefined) {
                            if (node[0].link !== "") {
                                window.open(node[0].link, "_blank");
                            }
                        }
                    }
                });
                chartcanvasNetwork.fit();
            } catch (err) {
                console.log("Initial Workflow scale is not set. ", err);
            }
        } else {
            try {
                canvasNetwork = new vis.Network(container, data, options);
                container.getElementsByTagName("canvas")[0].style.cursor = "pointer";

                canvasNetwork.on("click", function (params) {
                    var node = nodes.get(params.nodes);

                    if (node.length != 0) {
                        if (node[0].info !== "" && node[0].info !== undefined) {
                            $(".vis-tooltip").css("visibility", "hidden");
                            bindModal(node[0].info);
                        } else if (node[0].type !== "" && node[0].type !== undefined) {
                            if (node[0].link !== "") {
                                window.open(node[0].link, "_blank");
                            }
                        }
                    }
                });
                canvasNetwork.fit();
            } catch (err) {
                console.log("Initial Workflow scale is not set. ", err);
            }
        }
        // create an array with nodes
        var legendNodes = new vis.DataSet();

        // create an array with edges
        var legendEdges = new vis.DataSet();

        // legend
        var mynetwork = "";
        mynetwork = document.getElementById("divLegend");
        var x = -mynetwork.clientWidth / 2 + 50;
        var y = -mynetwork.clientHeight / 1.5 + 20;
        var step = 95;
        legendNodes.add({
            id: 1000,
            x: x + 10,
            y: y + step + 30,
            label: "Nodes",
            shape: "text",
            size: 30,
            fixed: true,
            physics: false,
            font: {
                multi: true,
                color: "#357ebd",
                size: 30,
                bold: {
                    color: "#357ebd",
                },
            },
        });
        legendNodes.add({
            id: 1001,
            x: x,
            y: y + 2 * step,
            label: "External",
            title:
                "<b>External:</b><br>The external node represents <br> content that was used <br> within the paper, <br> but not generated within the paper.",
            size: 10,
            shape: "dot",
            color: "red",
            fixed: true,
            physics: false,
            chosen: {
                label: false,
                node: changeChosenLegendNodeSize,
            },
        });

        legendNodes.add({
            id: 1002,
            x: x,
            y: y + 3 * step,
            label: "Dataset",
            title:
                "<b>Dataset:</b><br>The dataset node represents <br> data generated by <br> either a Tool or Script node.",
            color: "gray",
            size: 23,
            shape: "dot",
            fixed: true,
            physics: false,
            chosen: {
                label: false,
                node: changeChosenLegendNodeSize,
            },
        });
        legendNodes.add({
            id: 1003,
            x: x,
            y: y + 4 * step,
            label: "Script",
            group: "Script",
            title:
                "<b>Script:</b><br>The script node represents <br> user-defined procedures <br> utilized in the paper <br> (e.g. to analyze or post-process <br> data belonging to datasets).",
            color: "green",
            shape: "triangle",
            size: 23,
            fixed: true,
            physics: false,
            chosen: {
                label: false,
                node: changeChosenLegendNodeSize,
            },
        });

        legendNodes.add({
            id: 1004,
            x: x,
            y: y + 5 * step,
            label: "Tool",
            title:
                "<b>Tool:</b><br>The tool node represents <br> an instrument <br>(either software or <br> experimental set up) <br> utilized in the paper.",
            size: 23,
            color: "blue",
            shape: "diamond",
            fixed: true,
            physics: false,
            chosen: {
                label: false,
                node: changeChosenLegendNodeSize,
            },
        });
        legendNodes.add({
            id: 1005,
            x: x,
            y: y + 6 * step,
            label: "Chart",
            group: "Chart",
            title:
                "<b>Chart:</b><br>The chart node represents <br> a figure or a table, <br> and is typically considered <br> an end-point within <br> the workflow.",
            color: "orange",
            shape: "square",
            size: 23,
            fixed: true,
            physics: false,
            chosen: {
                label: false,
                node: changeChosenLegendNodeSize,
            },
        });

        var data = {
            nodes: legendNodes,
            edges: legendEdges,
        };

        options.interaction.zoomView = false;
        options.interaction.dragView = false;
        options.interaction.dragNodes = false;
        try {
            chartlegendNetwork = new vis.Network(mynetwork, data, options);
            if (isChart) {
                mynetwork.getElementsByTagName("canvas")[0].style.cursor = "pointer";
                chartlegendNetwork.fit();
            } else {
                legendNetwork = new vis.Network(mynetwork, data, options);
                mynetwork.getElementsByTagName("canvas")[0].style.cursor = "pointer";
            }
        } catch (err) {
            console.log("Initial Workflow scale is not set. ", err);
        }
    } else {
        $("#showWorkflow").hide();
    }
}

function createGoogleDatasetsScript(paperDetails) {
    if (paperDetails && paperDetails.title && paperDetails.authors) {
        var auth = [];
        var autharray = paperDetails.authors.split(",");
        $.each(autharray, function (i, item) {
            auth.push({ "@type": "Person", name: item });
        });
        var value = {
            "@context": "http://schema.org/",
            "@type": "Dataset",
            dateCreated: paperDetails.timeStamp,
            name: paperDetails.title,
            description: paperDetails.abstract,
            url: window.location.href,
            keywords: paperDetails.tags,
            publisher: { "@type": "Organization", name: "Qresp" },
            creator: auth,
            version: "1",
            identifier: paperDetails.cite,
        };
        var script = document.createElement("script");
        script.type = "application/ld+json";
        script.innerHTML = JSON.stringify(value);
        document.getElementsByTagName("head")[0].appendChild(script);
    }
}
