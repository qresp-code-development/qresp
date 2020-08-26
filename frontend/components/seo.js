import Head from "next/head";
import PropTypes from "prop-types";

const SEO = (props) => {
  const { title, description, author } = props;
  return (
    <Head>
      <title>{title}</title>
      <meta property="og:title" content={title} key="title" />
      <meta property="og:description" content={description} key="description" />
      <meta
        property="og:image"
        content="https://github.com/anti-mony/qresp/raw/ReWrite/frontend/public/images/QrespLogoDark.png"
      />
      <meta property="og:type" content="website" key="type" />
      <meta property="twitter:creator" content={author} key="twitterauthor" />

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
