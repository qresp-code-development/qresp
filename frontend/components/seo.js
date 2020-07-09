import Head from "next/head";
import PropTypes from "prop-types";

const SEO = (props) => {
  const { title, description, author } = props;
  return (
    <Head>
      <title>{title}</title>
      <meta name="viewport" content="initial-scale=1.0, width=device-width" />
      <meta property="description" content={description} />
      <meta property="og:title" content="My page title" key="title" />
      <meta property="og:description" content={description} key="description" />
      <meta property="og:type" content="website" key="type" />
      <meta property="twitter:card" content="summary" key="twittersummary" />
      <meta property="twitter:creator" content={author} key="twitterauthor" />
      <meta property="twitter:description" content={title} key="twittertitle" />
      <meta
        property="twitter:creator"
        content={description}
        key="twitterdescription"
      />
    </Head>
  );
};

SEO.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
  author: PropTypes.string.isRequired,
};

export default SEO;
