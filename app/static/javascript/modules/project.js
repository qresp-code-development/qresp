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
	$("#navbar>li.is-active").removeClass("is-active");
	$("#detailsid").addClass("is-complete");
	$("#welcomeid").addClass("is-complete");
	$("#serverid").addClass("is-complete");
	$("#projectid").addClass("is-active");
    toggleOnOff(false,"http_service_path");
	toggleOnOff(false,"git_service");
	toggleOnOff(false,"globus_service_path");
	saveProjectPath();
	callTree();
});

function saveProjectPath(){
	var path = $("#path").val();
	$.ajax({
		method: 'POST',
		url: '/project',
		dataType: "json",
		contentType: "application/json ; charset=utf-8",
		data: JSON.stringify(path),
		success: function (data) {
				$("#path").val(data.fileServerPath);
				if(data.fileServerPath.length>0){
					toggleOnOff(true,"http_service_path");
				}
				if(data.gitPath.length>0){
					toggleOnOff(true,"git_service");
				}
				if(data.downloadPath.length>0){
					toggleOnOff(true,"globus_service_path");
				}
				$("#navbar>li.is-active").removeClass("is-active");
				$("#projectid").addClass("is-active");
		}
	});
}

// else {
// 				if(data.projectPath.isConfigFile === "N"){
// 					var r = window.confirm("Are you sure you want to curate the paper "+data.projectPath.projectName);
// 				}
// 				$("#projectid").addClass("is-complete");
// 				$("#curateid").addClass("is-active");
// 				$("#curateid a").removeClass("disabled");
// 				$("#curateid span").removeClass("disabled");
// 			}


function callTree(){
	var searchdata = $("#path").val();
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
