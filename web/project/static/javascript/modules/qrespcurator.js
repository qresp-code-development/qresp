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

$(document).ready(function () {
	$("#navbar>li.is-active").removeClass("is-active");
	$("#welcomeid").addClass("is-active");
});

$(document).on("click", "#btnParse", function(event){

	$.post({
		url: "/uploadFile",
		data: JSON.stringify($("#myTextArea").val()),
		contentType: "application/json",
		success: function(){
			window.location.href = "details";
		}
	});



});



	// $.ajax({
	// 	type:"POST",
	// 	url: "/uploadFile",
	// 	data: $("#myTextArea").val()
	// });
