# Publish

## How was it done

In upto release 1.2.2, there was a strong dependence on Google services because that was the authentication/verification method.

Basically, on publish we would ask the user to login using a google account and if successful we publish.

## How it's done currently

Now, we generate a publish link and send it to the user's email. And when the user clicks on that link in the mailm, it redirects to Qresp and the paper is published.

## Why ?

No Google dependence anymore, more fluent. We maintain most of the routes, people with their university emails can curate and publish.

## Technically

Let's talk about exaclt what'll happen when the user clicks the publish button

### Flow

1. On click, the data comes in a json format as defined in the schema at the route `/api/publish`. We store that data temporarily in the publish folder on disk (This needs to be database in the future, really).
2. We process the data and send back a verify(or the actual) publish link to the curator via email.
3. If there are any errors the user is provided with the error and no email is sent.

4. The user clicks on the link in the url in the email and is redirected to the GUI of the instance. The link would be like `instance/publish/{id}`, the frontend then takes in the id, calls the api at `/api/verify/{id}`. This is where we nmotify the user that paper is successfully published or if there was error.

## Contributing

Always welcome, thanks. Suggestions, pull requests welcome. If you find a bug please, open on issue on Github.
