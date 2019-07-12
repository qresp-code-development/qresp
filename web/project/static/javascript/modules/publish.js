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
            async: false,
            contentType: "application/json ; charset=utf-8",
            success: function (data) {
                var blob = new Blob([JSON.stringify(data["paper"])],{type: "text/json;charset=utf-8;"});
				if (navigator.msSaveBlob) { // IE 10+
						navigator.msSaveBlob(blob, "data.json")
				}
				else {
                    var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data["paper"]));
                    var dlAnchorElem = document.getElementById("downloadLink");
                    dlAnchorElem.setAttribute("href", dataStr);
                    dlAnchorElem.setAttribute("download", "data.json");
                    dlAnchorElem.click();
                    var previewAnchorElem = document.getElementById("previewLink");
                    var projectName = data["projectName"];
                    console.log("a",projectName);
                    previewAnchorElem.setAttribute("href", "/preview/"+projectName);
                }
            }
        });

});

