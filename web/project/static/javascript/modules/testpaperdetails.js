$('input[type=file]').change(function (event) {
    $('#customfileupload').html($(this).val().replace("C:\\fakepath\\", ""));
    var reader = new FileReader();
    reader.onload = onReaderLoad;
    reader.readAsText(event.target.files[0]);
});

function onReaderLoad(event) {
    var obj = JSON.parse(event.target.result);
    $('#myTextArea').val(event.target.result.toString());
    $('#Save').removeAttr('disabled'); // updated according to https://stackoverflow.com/questions/7637790/how-to-remove-disabled-attribute-with-jquery-ie
}
$(document).on("click", "#btnParse", function(event){
    $.post({
        url: "/uploadFile",
        data: JSON.stringify($("#myTextArea").val()),
        contentType: "application/json",
        success: function(data){
            if("error" in data){
				$(".alert").text("Unable to process JSON");
            }else {
                window.location.href = "details";
            }
        }
    });
});

$(function () {

        // Details form
        $('#detailsform').submit(function (e) {
            $.ajax({
                type: "POST",
                url: "testdetails",
                data: $('#detailsform').serialize(), // serializes the form's elements.
                success: function (data) {
                    console.log(data);  // display the returned data in the console.
                    buildCuratorTable(data.data);
                    $('#editCurator').hide();
                    $('#showCurator').show();
                    $('#serverOne').collapse('show');
                }
            });
            e.preventDefault(); // block the traditional submission of the form.
        });

        //server form
        $('#serverform').submit(function (e) {
            $.ajax({
                type: "POST",
                url: "testserver",
                data: $('#serverform').serialize(), // serializes the form's elements.
                success: function (data) {
                    console.log(data);  // display the returned data in the console.
                    if(data.data['kind'].includes("HTTP")){
                        buildServerTable(data.data['hostUrl']);
                        callTreeData({'treeUrl':data.data['hostUrl']});
                        $('#folderAbsolutePath').val(data.data['hostUrl']);
                    }else if(data.data['kind'].includes("Zenodo")){
                        buildServerTable(data.data['zenodoUrl']);
                        callTreeData({'treeUrl':data.data['zenodoUrl']+'#tree_item0'});
                        $('#folderAbsolutePath').val(data.data['zenodoUrl']);
                    }else{
                        callTreeData({'treeUrl':data.data['other']});
                        $('#folderAbsolutePath').val(data.data['other']);
                    }
                    $('#editServer').hide();
                    $('#showServer').show();
                    $('#projectOne').collapse('show');
                }
            });
            e.preventDefault(); // block the traditional submission of the form.
        });

        //project form
        $('#projectform').submit(function (e) {
            $.ajax({
                type: "POST",
                url: "testsetproject",
                data: $('#projectform').serialize(), // serializes the form's elements.
                success: function (data) {
                    console.log(data);  // display the returned data in the console.
                    buildProjectTable(data);
                    $('#editProject').hide();
                    $('#showProject').show();
                    $('#chartOne').collapse('show');
                }
            });
            e.preventDefault(); // block the traditional submission of the form.
        });


        // chart form
        $('#chartform').submit(function (e) {
             $.ajax({
                    type: "POST",
                    url: "testcharts",
                    data: $('#chartform').serialize(), // serializes the form's elements.
                    success: function (data) {
                        console.log("c> ",data);
                        $('#chartModal').modal('hide');
                        $('#editWorkflow').show();
                        buildChartTables(data.chartList,data.folderAbsolutePath);
                        addToWorkflow();
                    }
                });
                e.preventDefault(); // block the traditional submission of the form.
        });


        // Inject our CSRF token into our AJAX request.
        $.ajaxSetup({
            beforeSend: function(xhr, settings) {
                if (!/^(GET|HEAD|OPTIONS|TRACE)$/i.test(settings.type) && !this.crossDomain) {
                    xhr.setRequestHeader("X-CSRFToken", "{{ form.csrf_token._value() }}")
                }
            }
        });

    $(document).on('click', '.button-icon', function () {
        $(this).toggleClass("active");
        $(this).next(".icons").toggleClass("open");
    });

    $('#tblcharts tbody').on('click', '.button-icon', function () {
        $(this).toggleClass("active");
        $(this).next(".icons-charts").toggleClass("open");
    });

    $("#btnSearch").on("click",function () {
        callTreeData({'treeUrl':$('#folderAbsolutePath').val()});
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
        $(this).prev(".card-header").find(".fa-plus").addClass("fa-minus").removeClass("fa-plus");
    });

    // Toggle plus minus icon on show hide of collapse element
    $(".collapse").on('show.bs.collapse', function(){
        $(this).prev(".card-header").find(".fa-plus").removeClass("fa-plus").addClass("fa-minus");
    }).on('hide.bs.collapse', function(){
        $(this).prev(".card-header").find(".fa-minus").removeClass("fa-minus").addClass("fa-plus");
    });


    // copy files
    $('form[name="charts"] #files').bind("keyup focusin", function () {
        $('#treeModal').modal('show');
        var url = $('#lblProject').text().includes("zenodo") ? $('#lblProject').text() +'#tree_item0' : $('#lblProject').text();
        callTreeDataForCuration({'treeUrl':url});
        $(".tree-modal-form #formname").val("charts");
        $(".tree-modal-form #fieldname").val("files");
    });

    //copy image files
    $('form[name="charts"] #imageFile').bind("keyup focusin", function () {
        $('#treeModal').modal('show');
        var url = $('#lblProject').text().includes("zenodo") ? $('#lblProject').text() +'#tree_item0' : $('#lblProject').text();
        callTreeDataForCuration({'treeUrl': url});
        $(".tree-modal-form #formname").val("charts");
        $(".tree-modal-form #fieldname").val("imageFile");
    });



});


function copyContent(formname,fieldname){
    var values = [];
    var projectName = $("#lblProject").text();
    var formname = $("#formname").val();
    var fieldname = $("#fieldname").val();
    $("#tree-modal").fancytree("getTree").visit(function (node) {
        if (node.selected) {
            if (node.folder != "true") {
                var keypath = node.key;
                var path = keypath.substring(keypath.indexOf(projectName) + projectName.length);
                console.log("p>",path, formname, fieldname);
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

function buildCuratorTable(data){
    $("#lblCuratorName").html(data.firstName+ " "+data.middleName+" "+data.lastName);
    $("#lblCuratorEmail").html(data.emailId);
    $("#lblCuratorAffiliation").html(data.affiliation);
}

function buildServerTable(data){
    $("#lblServer").html(data);
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

function callTreeData(searchdata){
    console.log(searchdata);
    $.ajax({
        method: 'POST',
        url: '/testgetTreeInfo',
        dataType: "json",
        contentType: "application/json ; charset=utf-8",
        data: JSON.stringify(searchdata),
        success: function (data) {
            if(typeof data.services !== 'undefined'){
                data.services.forEach(function(element) {
                    if (element){
                        toggleOnOff(true,element);
                    }
                });
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
                        url: '/testgetTreeInfo',
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
                    $("#folderAbsolutePath").val(data.node.key);
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
	url: '/testgetTreeInfo',
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
					url: '/testgetTreeInfo',
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
                                if (notebookPath.indexOf('notebooks') < 0) {
                                    notebookPath = notebookPath.replace(/^(https?:\/\/)?(www\.)?/, '');
                                    notebookPath = "http://nbviewer.jupyter.org/url/" + notebookPath;
                                }
                            }
                            var notebooks = ($
                                .trim(row.notebookFile) == "") ? ""
                                : "<li><a href='"
                                + path
                                + "/"
                                + $.trim(row.notebookFile)
                                + "' title='View the Jupyter Notebook' target='_blank' ><img src='/static/images/jupyter.png' alt='jupyter'></a></li>";

                            var downloads = ($
                                .trim(path) == "") ? ""
                                : "<li><a href='"
                                + $
                                    .trim(path)
                                + "' title='Download the data source for the chart from this Endpoint' target='_blank'><img src='/static/images/download-icon.png' alt='download'></a></li>";

                            // var workflows = ($
                            //     .trim(paperDetails._PaperDetails__id) == "") ? ""
                            //     : "<li><a href='javascript:void'><img data-workflow='"
                            //     + paperDetails._PaperDetails__id
                            //     + ","
                            //     + $.trim(row.id)
                            //     + "' src='/static/images/workflow.png' data-toggle='modal' data-target='#chartWorkflowModalMode' class='workflowimg' alt='workflow'></a></li>";

                            chartInfo += datatree +downloads + notebooks + "</ul></div>";
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
                                        console.log("c2> ",item);

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
}

function toggleOnOff(state,service){

    if(state){
        //$('.off'+service.toString()).prop('checked',false);
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
    var plist = [];
    $.ajax({
        method: 'POST',
        url: '/testworkflow',
        dataType: "json",
        contentType: "application/json ; charset=utf-8",
        data: JSON.stringify(plist),
        success: function (data) {
            bindChartWorkflow(data.workflow);
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
	function bindChartWorkflow(jsonData) {
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
		}

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
		}


		var options = {
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


			interaction: {
				hover: true,
				dragNodes :true
			},
			layout: {
				improvedLayout:true,
				randomSeed:8
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
					removeNode(data,callback);
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
					var value = val.split("*");
					nodes.add([{
							x:x,
							y:y+ cid * step,
							id: "c" + index.toString(),
							label: value[0],

							shape : ShapeSelection("c"),
							size: 23,
							color: ColorSelection("c"),
							title: value[1],
							chosen: {
								label: false,
								node: changeChosenNodeSize
							},
							font: {
								multi: 'html',
								size: 20,
								bold: {
									color: '#0077aa'
								}
							},
						}]);


				});
			} else if (key == "datasets") {
				var anetwork = document.getElementById('divWorkflow');
				var x = -anetwork.clientWidth / 2 + 50;
				var y = -anetwork.clientHeight / 1.8 + 50;
				var step = 80;
				x = x + step
				var did = 0;
				$.each(value, function (index, val) {
					var value = val.split("*");
					nodeId = nodeId + 1;
					did = did + 1;
					nodes.add([{
							x: x,
							y: y + did * step,

							id: "d" + index.toString(),
							label: value[0],
							shape : ShapeSelection("d"),
							size: 23,
							color: ColorSelection("d"),
							title: value[1],

							chosen: {
								label: false,
								node: changeChosenNodeSize
							},
							font: {
								multi: 'html',
								size: 20,
								bold: {
									color: '#0077aa'
								}
							},
						}]);
				});
			} else if (key == "scripts") {
				var anetwork = document.getElementById('divWorkflow');
				var x = -anetwork.clientWidth / 2 + 50;
				var y = -anetwork.clientHeight / 1.8 + 50;
				var step = 80;
				x = x + 2 * step
				var sid = 0;
				$.each(value, function (index, val) {
					nodeId = nodeId + 1;
					sid = sid + 1;
					var value = val.split("*");
					nodes.add([{
							x: x,
							y: y+ sid * step,

							id: "s" + index.toString(),

							label: value[0],

							shape : ShapeSelection("s"),
							size: 23,
							color: ColorSelection("s"),
							title: value[1],
							chosen: {
								label: false,
								node: changeChosenNodeSize
							},
							font: {
								multi: 'html',
								size: 20,
								bold: {
									color: '#0077aa'
								}
							},
						}]);
				});
			}
			else if (key == "tools") {
				var anetwork = document.getElementById('divWorkflow');
				var x = -anetwork.clientWidth / 2 + 50;
				var y = -anetwork.clientHeight / 1.8 + 50;
				var step = 80;
				x = x + 3 * step

				var tid = 0;
				$.each(value, function (index, val) {
					nodeId = nodeId + 1;
					tid = tid + 1;
					var value = val.split("*");
					nodes.add([{
							x:x,
							y: y + tid * step,

							id: "t" + index.toString(),

							label: value[0],

							shape : ShapeSelection("t"),
							size: 23,
							color: ColorSelection("t"),
							title: value[1],


							chosen: {
								label: false,
								node: changeChosenNodeSize
							},
							font: {
								multi: 'html',
								size: 20,
								bold: {
									color: '#0077aa'
								}
							},
						}]);
				});
			}
			else if (key == "heads") {
				var hid = 0;
				var anetwork = document.getElementById('divWorkflow');
				var x = -anetwork.clientWidth / 2 + 50;
				var y = -anetwork.clientHeight / 1.8 + 50;
				var step = 80;
				x = x + 4 * step
				$.each(value, function (index, val) {
					headNum = headNum + 1;
					nodeId = nodeId + 1;
					hid = hid + 1;
					var value = val.split("*");
					if(value[2] !== undefined){
						headInfo.push("h" + headNum.toString()+"*"+value[1]+"*"+value[2]);
					}else{
						headInfo.push("h" + headNum.toString()+"*"+value[1]);
					}
					nodes.add([{
							x: x,
							y: y + hid * step,
							id: "h" + headNum.toString(),
							label: "h" + headNum.toString(),
							shape : ShapeSelection("h"),
							size: 10,
							color: ColorSelection("h"),
							title: value[1],
							chosen: {
								label: false,
								node: changeChosenNodeSize
							},
							font: {
								multi: true,
								size: 20,
								color: '#ffffff',
								bold: {
									color: '#ffffff'
								}
							},
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
				alert("A read me to the External is mandatory.");
				return;
			}
			headNum = headNum + 1;

			var head = "h" + headNum.toString() + "*" + document.getElementById('node-readme').value + "*" + document.getElementById('node-url').value
			headInfo.push(head);
			nodeId = nodeId + 1;
			data.id = "h" + headNum.toString();
			data.color = ColorSelection("h");
			data.label = "h" + headNum.toString();
			data.shape = ShapeSelection("h");
			data.title = document.getElementById('node-readme').value;
			data.size = 10;

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
		network = new vis.Network(container, data, options);
		network.moveTo({
			position: {x: 0, y: 0},
			scale: 1
		});

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
		var mynetwork = document.getElementById('divLegends');
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




	function connectedNodes(type) {
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
		var check = true;
		if (nodes.length != unique(uniqueconnectednodes).length) {
			check = window.confirm("There are unconnected nodes. Are you sure you want to continue?");
		}

		if (check){
			callWorkflow(connections,"POST");
		}
		else
			return;
	}

	function addPhysics() {
		var options = {
		  physics:{
			stabilization: false
		  }
		}
		network.setOptions(options);
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

