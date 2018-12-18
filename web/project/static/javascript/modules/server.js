$(document).ready(function () {
	$("#navbar>li.is-active").removeClass("is-active");
	$("#detailsid").addClass("is-complete");
	$("#welcomeid").addClass("is-complete");
	$("#serverid").addClass("is-active");
	$("#btnServer").on("click",function () {
		var isDUO = $('input[name=isDUOAuth]:checked').val();
		console.log("isDUO",isDUO);
		if("Yes" === isDUO){
			console.log("here");
			$(".alert-success").toggleClass('fade');
		}
    });
});
