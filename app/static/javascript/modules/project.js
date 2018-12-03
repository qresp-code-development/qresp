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

$(document).ready(function () {

    toggleOnOff(false,"http_service_path");
	toggleOnOff(false,"git_service");
	toggleOnOff(false,"globus_service_path");
	saveProjectPath();
	callTree();
});

function saveProjectPath(){
	var treedata = $('.tree-form').serializeArray();
	var searchdata = getFormData(treedata);
	$.ajax({
		method: 'POST',
		url: '/projectPath',
		dataType: "json",
		contentType: "application/json ; charset=utf-8",
		data: JSON.stringify(searchdata),
		success: function (data) {
				console.log("d>>",data);
				$("#path").val(data.fileServerPath);
				if(data.projectPath.fileServerPath.length>0){
					toggleOnOff(true,"http_service_path");
				}
				if(data.projectPath.gitPath.length>0){
					toggleOnOff(true,"git_service");
				}
				if(data.projectPath.downloadPath.length>0){
					toggleOnOff(true,"globus_service_path");
				}
				$("#navbar>li.is-active").removeClass("is-active");
				$("#detailsid").addClass("is-complete");
				$("#welcomeid").addClass("is-complete");
				$("#serverid").addClass("is-complete");
				$("#projectid").addClass("is-active");
		}
	});
}



function callTree(){
	var treedata = $('.tree-form').serializeArray();
	var searchdata = getFormData(treedata);
	$.ajax({
		method: 'POST',
		url: '/getTreeInfo',
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
					overrideSource: false,
					store: "cookie", // force using cookies!
				},
				source: data.listObjects,
				lazyLoad: function (event, data) {
					var treedata = $('.tree-form').serializeArray();
					var searchdata = {};
					var node = data.node;
					searchdata["path"] = node.key;
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
					$("#path").val(data.node.key);
				},
				cookieId: "fancytree-Cb4",
				idPrefix: "fancytree-Cb4-"
			});

		},
		error: function (jqXHR, status, thrownError) {
			alert("No Access to folder. Please recheck");
		}
	});

}

function getFormData(formdata){
		var unindexed_array = formdata;
		var indexed_array = {};
		$.map(unindexed_array, function(n, i){
			indexed_array[n['name']] = n['value'];
		});
		return indexed_array;
}