var queryString = window.location.search.slice(1).split("=")
var servers = "";
if(queryString.includes("servers")){
    servers = queryString[1];
}
$(function () {
    var isClicked = false;
    $('.dropdown-bt').click(function (e) {
        if (isClicked) {
            $('.custom-dropdown').removeClass('show');
            $('.custom-dropdown-lg').removeClass('show');

            isClicked = false;
        } else {
            $('.custom-dropdown-lg').addClass('show');

            $('.custom-dropdown').addClass('show');
            isClicked = true;
        }
    });
    var collectionList = [];
    var authorsList = [];
    var publicationList = [];

   $('.filtersearch').click(function (e) {
        var paperTitle = $("#txtPaperTitle").val();
        var doi = $("#txtDOI").val();
        var tags = $("#txtTags").val();
        var collectionList = $('#collectionList').val();
        var authorsList = $('#authorsList').val();
        var publicationList = $('#publicationList').val();
        $.getJSON('/searchWord', {
            paperTitle: paperTitle,
            doi: doi,
            tags: tags,
            collectionList: JSON.stringify(collectionList),
            authorsList: JSON.stringify(authorsList),
            publicationList: JSON.stringify(publicationList),
            servers: servers
        }, function (data) {
            buildTable(data['allpaperslist']);
            $('#qresp-logo').hide('slow', function () {
                $('#qresp-logo').remove();
            });
            $("#paperContainer").show("slow");
            $("#overlay-div").removeAttr("style");
        });
        return false;
    });

    $("#more-less-options-button").click(function () {
        var txt = $("#searchForm").is(':visible') ? 'Advanced Search >>' : 'Advanced Search <<';
        $("#more-less-options-button").text(txt);
        $("#searchForm").slideToggle("slow");
    });


    $(document).on('click', '.button-icon', function () {
        $(this).toggleClass("active");
        $(this).next(".icons").toggleClass("open");
    });


});

function buildTable(allPapers) {
    if(allPapers && allPapers.length>0) {
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
            "scrollX": true,
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
                        var link = "<a href='/paperdetails/" + row["_Search__id"] + "?servers=" + servers + "' class='alltab'>";
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

                        //Tags
                        var tags = "<ul class='tags'>";
                        $.each(row["_Search__tags"], function (index, item) {
                            item = $.trim(item);
                            var tag = '<li><a href="#" class="tag">' + item + '</a></li>';
                            tags += tag;
                        });
                        tags += "</ul>";
                        title += tags;


                        //Icons
                        title += "<div id='toolbar' style='margin-top: 10px;margin-bottom: 10px;'>";
                        title += "<div class='button-icon'></div>";
                        title += "<ul class='icons'>";
                        var charts = "<li><a href='/paperdetails/" + row["_Search__id"]  + "?servers=" + servers +  "' title='Charts' class='charttab'><img src='static/images/figures.png' alt='charts' style='margin-bottom:2px;'></a></li>";
                        var workflows = "<li><a href='/paperdetails/" + row["_Search__id"]  + "?servers=" + servers +  "' title='Workflows' class='workflowtab'><img src='static/images/workflow.png' alt='jupyter'></a></li>";
                        var downloads = "<li><a href='" + row["_Search__downloadPath"] + "' title='Download' target='_blank'><img src='static/images/download-icon.png' alt='download'></a></li>";
                        var notebookPath = row["_Search__notebookPath"];
                        var notebookFile = row["_Search__notebookFile"];
                        if (notebookPath !== undefined && notebookPath !== "") {
                            if (notebookPath.indexOf('notebooks') < 0) {
                                notebookPath = notebookPath.replace(/^(https?:\/\/)?(www\.)?/, '');
                                notebookPath = "http://nbviewer.jupyter.org/url/" + notebookPath;
                            }
                        }
                        if (notebookFile !== undefined && notebookFile !== null && notebookFile !== "") {
                            notebookPath = notebookPath + "/" + notebookFile;
                        }
                        var notebooks = "<li><a href='" + notebookPath + "' title='Jupyter Notebook' target='_blank'> <img src='static/images/jupyter.png' alt='jupyter'></a></li>";
                        title += charts + workflows + downloads + notebooks + "</ul>";
                        title += "</div>";
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
                    "visible": true,
                    "searchable": true,
                    "width": "5%",
                    "sortable": true
                }
            ],
            "search": {
                "caseInsensitive": true,
                "regex": false,
                "smart": true
            },
            "language": {
                "lengthMenu": "Show _MENU_ records",
                "info": "Showing _START_ to _END_ of _TOTAL_ records",
                "infoFiltered": "(filtered from _MAX_ total records)"
            }
        });
    }
}