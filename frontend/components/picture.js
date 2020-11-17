import PropTypes from "prop-types";

const Picture = ({ imgSrc, imgAlt, ...rest }) => {
  return (
    <picture>
      <source srcSet={`${imgSrc}.webp`} type="image/webp" />
      <source srcSet={`${imgSrc}.png`} type="image/png" />
      <img src={`${imgSrc}.png`} alt={imgAlt} {...rest} />
    </picture>
  );
};

Picture.propTypes = {
  imgSrc: PropTypes.string.isRequired,
  imgAlt: PropTypes.string.isRequired,
};

export default Picture;
