$(document).ready(function () {
	$("#navbar>li.is-active").removeClass("is-active");
	$("#detailsid").addClass("is-complete");
	$("#welcomeid").addClass("is-complete");
	$("#serverid").addClass("is-active");
    // $("#btnServer").on("click",function () {
		// var isDUO = $('input[name=isDUOAuth]:checked').val();
		// var isSSH = $('input[name=kind]:checked').val();
		// if("Yes" === isDUO && "SSH Connection" === isSSH){
		// 	console.log("here");
		// 	$(".alert-success").toggleClass('fade');
		// }
    // });
    //
    // $('form[name="server"] input[name=kind]').on( "change", function() {
    //      var test = $(this).val();
    //      $('form[name="server"] .serverClass').hide();
    //      $('form[name="server"] #'+test).show();
    // });


});

function buildTable(allPapers) {
    if ($.fn.DataTable.isDataTable('#tblPapers')) {
        $('#tblPapers').DataTable().destroy();
    }
    $('#tblPapers tbody').empty();
    $("#tblPapers").DataTable({
        "data": allPapers,
        "serverSide": false,
        "lengthMenu": [[10, 25, 50, 100, 500, -1],
            [10, 25, 50, 100, 500, "All"]],
        "pageLength": 10,
        "responsive": true,
        "columns": [
            {
                "data": "_Search__id",
                "visible": false,
                "searchable": false,
                "sortable": false
            },
            {
                "data": "_Search__title",
                "visible": true,
                "searchable": true,
                "sortable": true,
                "width": "95%",
                "render": function (data, type, row, meta) {
                    var title = "<div id='titleId'><p style='font-size:18px;color:#1a0dab;font-weight:bold;'>";
                    //title
                    var link = "<a href='/paperdetails/" + row["_Search__id"] + "' class='alltab'>";
                    title += link + data + "</a></p>";

                    //authors
                    var temp = "";
                    // $.each(row["_Search__authors"], function (i, item) {
                    //     temp += item['firstName'] + " " + item['lastName'] + ", ";
                    // });
                    // temp = temp.replace(/,\s*$/, "");
                    temp = row["_Search__authors"]
                    title += "<p>" + temp + "</p>";

                    //published In
                    title += "<p> <a href='http://DOI.org/" + row["_Search__doi"] + "' title='Publication' target='_blank'>" + row["_Search__publication"] + "</a></p>";

                    return title;
                }

            },
            {
                "data": "_Search__tags",
                "visible": false,
                "searchable": true,
                "sortable": false
            },
            {
                "data": "_Search__collections",
                "visible": false,
                "searchable": true,
                "sortable": false
            },
            {
                "data": "_Search__authors",
                "visible": false,
                "searchable": true,
                "sortable": false
            },
            {
                "data": "_Search__publication",
                "visible": false,
                "searchable": true,
                "sortable": false
            },
            {
                "data": "_Search__abstract",
                "visible": false,
                "searchable": true,
                "sortable": false
            },
            {
                "data": "_Search__doi",
                "visible": false,
                "sortable": false,
                "searchable": true
            },
            {
                "data": "_Search__serverPath",
                "visible": false,
                "searchable": false,
                "sortable": false
            },
            {
                "data": "_Search__folderAbsolutePath",
                "visible": false,
                "searchable": false,
                "sortable": false
            },
            {
                "data": "_Search__fileServerPath",
                "visible": false,
                "searchable": false,
                "sortable": false
            },
            {
                "data": "_Search__downloadPath",
                "visible": false,
                "searchable": false,
                "sortable": false
            },
            {
                "data": "_Search__notebookPath",
                "visible": false,
                "searchable": false,
                "sortable": false
            },
            {
                "data": "_Search__notebookFile",
                "visible": false,
                "searchable": false,
                "sortable": false
            },
            {
                "data": "_Search__year",
                "visible": false,
                "searchable": true,
                "width": "5%",
                "sortable": true
            }
        ],
        "search": {
            "caseInsensitive": true,
            "regex": false,
            "smart": true
        }

    });
}

