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
						headInfo.push("h" + headNum.toString()+"*"+value[1].substring(14,value[1].length)+"*"+value[2]);
					}else{
						headInfo.push("h" + headNum.toString()+"*"+value[1].substring(14,value[1].length));
					}
					nodes.add([{
							x: x,
							y: y + hid * step,
							id: "h" + headNum.toString(),
							label: value[0],

							shape : ShapeSelection("h"),
							size: 23,
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
			data.size = 23;

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
			console.log('clicked nodes nodes: ', headInfo);
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
			y: y + step + 20,
			label: 'External',
			shape : ShapeSelection("h"),
			title: 'The external node represents <br> content that was used <br> within the paper, <br> but documented elsewhere. <br> A reference/link is <br> typically provided.',
			color: 'red',
			size: 23,
			fixed: true,
			physics: false,
			chosen: {
				label: false,
				node: changeChosenLegendNodeSize
			},
			font: {
				multi: true,
				color: '#ffffff',
				bold: {
					color: '#ffffff'
				}
			},
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


	function callWorkflow(listconn) {
		var plist = [];
		if (listconn.length > 0) {
			plist.push(listconn);
			plist.push(headInfo);
		}
		$.ajax({
			method: 'POST',
			url: '/workflow',
			dataType: "json",
			contentType: "application/json ; charset=utf-8",
			data: JSON.stringify(plist),
			success: function (data) {

				bindChartWorkflow(data.workflow);

				// if (type == "POST") {
				// 	$("#navbar>li.is-active").removeClass("is-active");
				// 	$("#workflowid").addClass("is-complete");
				// 	$("#publishid").addClass("is-active");
				// 	$("#publishid a").removeClass("disabled");
				// 	$("#publishid span").removeClass("disabled");
				// } else {
				// 	$("#navbar>li.is-active").removeClass("is-active");
				// 	$("#curateid").addClass("is-complete");
				// 	$("#workflowid a").removeClass("disabled");
				// 	$("#workflowid").addClass("is-active");
				// 	$("#workflowid span").removeClass("disabled");
                //
				// 	bindChartWorkflow(data.workflow);
				// }
			}
		});
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
		var check = true;
		if (nodes.length != unique(uniqueconnectednodes).length) {
			check = window.confirm("There are unconnected nodes. Are you sure you want to continue?");
		}

		if (check){
			callWorkflow(connections);
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


	$(function () {
		callWorkflow(connections);
	});

