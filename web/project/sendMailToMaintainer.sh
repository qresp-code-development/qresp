#!/bin/sh
echo "Starting script for Sending Email"
echo $HOST_ADDR
FROM_ADDR=$1
TO_ADDR=$2
TODAY=$(date '+%a, %d %b %Y %H:%M:%S %z')
rm -rf mail.txt
echo "
MAIL FROM:$FROM_ADDR
RCPT TO:$TO_ADDR
DATA
From: $FROM_ADDR
To: $TO_ADDR
Date: $TODAY
Subject: Publish metadata to Qresp
Mime-Version: 1.0
Content-Type: text/html

<html>
<body>
<p>
WELCOME <b>Qresp</b> user!
</p>
<p> The user $FROM_ADDR has published metadata to <b>Qresp</b> Explorer <br/>
</p>

<p>
If you did not open this request, do not click on the link above.<br/>
For assistance please reply to this email.
</p>

<p>
Thanks you, <br/>
Qresp team
</p>

</body>
</html>

.
QUIT
" >> mail.txt
nc $HOST_ADDR 25 <mail.txt
