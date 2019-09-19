$(function () {
    $("#btnPasscode").on('click',function(event) {
           $.ajax({
               type: "POST",
               url: "verifyPasscode", //"servlet/charts", //"./data/PaperDetails.json"
               data: $('#passcodeform').serialize(),
               success: function (data) {
                   if(data.msg === "success" ){
                       $("#passcodesection").toggle();
                        $("#mongoconnection").toggle();
                   }else{
                       alert("Passcode do not match");
                   }
               }
           });
         event.preventDefault();
    });

     $('input[name=httpService]').on( "change", function() {
         var test = $(this).val();
         if(test=='Yes') {
             $('#httpServicepath').show();
         }else{
             $('#httpServicepath').hide();
         }
    });

      $('input[name=globusService]').on( "change", function() {
         var test = $(this).val();
         if(test=='Yes') {
             $('#globusServicepath').show();
         }else{
             $('#globusServicepath').hide();
         }
    });

      $('#passcodeform').on('keyup keypress', function(e) {
  var keyCode = e.keyCode || e.which;
  if (keyCode === 13) {
    e.preventDefault();
    return false;
  }
});

});