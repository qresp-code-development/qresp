function openUploadSection(){
    $('#uploadDiv').toggle();
    $("html, body").animate({ scrollTop: $(document).height() }, "slow");
    return false;

}