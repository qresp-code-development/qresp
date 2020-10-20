import PropTypes from "prop-types";

const Picture = ({ imgSrc, imgAlt, ...rest }) => {
  return (
    <picture>
      <source srcSet={`${imgSrc}.webp`} type="image/webp" />
      <source srcSet={`${imgSrc}.jpg`} type="image/jpeg" />
      <img src={`${imgSrc}.jpg`} alt={imgAlt} {...rest} />
    </picture>
  );
};

Picture.propTypes = {
  imgSrc: PropTypes.string.isRequired,
  imgAlt: PropTypes.string.isRequired,
};

export default Picture;
