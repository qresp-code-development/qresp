$(function () {
    $("#navbar>li.is-active").removeClass("is-active");
		$("#detailsid").addClass("is-complete");
		$("#welcomeid").addClass("is-complete");
		$("#serverid").addClass("is-complete");
		$("#projectid").addClass("is-complete");
		$("#curateid").addClass("is-complete");
		$("#workflowid").addClass("is-complete");
		$("#publishid").addClass("is-active");

        $.ajax({
            method: 'POST',
            url: '/download',
            dataType: "json",
            contentType: "application/json ; charset=utf-8",
            success: function (data) {
                console.log(data);
            }
        });


	// 		$.ajax({
	// 	method: 'POST',
	// 	url: '/getDownload',
	// 	dataType: "json",
	// 	contentType: "application/json ; charset=utf-8",
	// 	data: JSON.stringify(plist),
	// 	success: function (data) {
	// 		var diverror = $('#errors');
	// 		diverror.empty();
	// 		if (type == "POST") {
	// 			$("#navbar>li.is-active").removeClass("is-active");
	// 			$("#downloadid").addClass("is-complete");
	// 			$("#publishid").addClass("is-active");
	// 			$("#publishid a").removeClass("disabled");
	// 			$("#publishid span").removeClass("disabled");
    //
	// 			var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data.project.desc));
	// 			var dlAnchorElem = document.getElementById('Download');
	// 			dlAnchorElem.setAttribute("href", dataStr);
	// 			dlAnchorElem.setAttribute("download", "data.json");
	// 			isClicked = true;
    //
	// 			dlAnchorElem.click();
	// 			$('#preloader').css("display", "none");
    //
	// 			$('#datacontent').load('/getPublishDetails');
    //
	// 			return false;
	// 		}
	// 	},
	// 	error: function (XMLhttpsRequest, textStatus) {
	// 		loadingoff();
	// 		alert("Errors! Mandatory fields missing. Please redo the Curation Step");
	// 		var diverror = $('#errors');
	// 		diverror.empty();
	// 		diverror.append("<div class='form-style-2 centrist'> <font color='red'>" + " " + XMLhttpsRequest.responseText+ " " + status + "</font></div>");
	// 	}
	// });

})





/*$(document).ready(function () {
	$('.tooltipster').tooltipster({
		plugins: ['sideTip', 'scrollableTip'],
		theme: 'tooltipster-punk',
		maxWidth:200,
		side: ['bottom','top'],
		delay:10,
		animation:'fade'
	});
			window.location.hash = "#download";

});*/

