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
    //saveProjectPath();
    callTreeData();
});

$("#Searchbtn").on("click",function () {
	//callTreeData();
	saveProjectPath('GET');
});

function saveProjectPath(type){
    var treedata = $('.tree-form').serializeArray();
    var searchdata = getFormData(treedata);
    $.ajax({
        method: 'POST',
        url: '/setproject',
        dataType: "json",
		async:false,
        contentType: "application/json ; charset=utf-8",
        data: JSON.stringify(searchdata),
		success: function (data) {
        	if(type === 'POST'){
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
				window.location = '/curate';
			}else {
        	    if(typeof data.services !== 'undefined'){
                    data.services.forEach(function(element) {
                        if (element){
                            toggleOnOff(true,element);
                        }
                    });
                }
                $("#folderAbsolutePath").val(data.folderAbsolutePath);
                window.location = '/project';
            }

        }
    });
}



function callTreeData(){
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
                    searchdata["folderAbsolutePath"] = node.key;
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
                    $("#folderAbsolutePath").val(data.node.key);
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