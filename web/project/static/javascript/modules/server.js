$(document).ready(function () {
	$("#navbar>li.is-active").removeClass("is-active");
	$("#detailsid").addClass("is-complete");
	$("#welcomeid").addClass("is-complete");
	$("#serverid").addClass("is-active");
	$("#btnServer").on("click",function () {
		var isDUO = $('input[name=isDUOAuth]').val()
		if("Yes" === isDUO){
			$(".alert-success").toggleClass('fade in');
		}
    });
});
