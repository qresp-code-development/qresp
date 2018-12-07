/* ------------------------------------------------------------------------
	Class: prettyPhoto
	Use: Lightbox clone for jQuery
	Author: Stephane Caron (http://www.no-margin-for-errors.com)
	Version: 3.1.6
------------------------------------------------------------------------- */
(function ($) {
    $.prettyPhoto = {version: '3.1.6'};

    $.fn.prettyPhoto = function (pp_settings) {
        pp_settings = jQuery.extend({
            hook: 'rel', /* the attribute tag to use for prettyPhoto hooks. default: 'rel'. For HTML5, use "data-rel" or similar. */
            animation_speed: 'fast', /* fast/slow/normal */
            ajaxcallback: function () {
            },
            slideshow: 5000, /* false OR interval time in ms */
            autoplay_slideshow: false, /* true/false */
            opacity: 0.80, /* Value between 0 and 1 */
            show_title: true, /* true/false */
            allow_resize: true, /* Resize the photos bigger than viewport. true/false */
            allow_expand: true, /* Allow the user to expand a resized image. true/false */
            default_width: 500,
            default_height: 344,
            counter_separator_label: '/', /* The separator for the gallery counter 1 "of" 2 */
            theme: 'pp_default', /* light_rounded / dark_rounded / light_square / dark_square / facebook */
            horizontal_padding: 20, /* The padding on each side of the picture */
            hideflash: false, /* Hides all the flash object on a page, set to TRUE if flash appears over prettyPhoto */
            wmode: 'opaque', /* Set the flash wmode attribute */
            autoplay: true, /* Automatically start videos: True/False */
            modal: false, /* If set to true, only the close button will close the window */
            deeplinking: true, /* Allow prettyPhoto to update the url to enable deeplinking. */
            overlay_gallery: true, /* If set to true, a gallery will overlay the fullscreen image on mouse over */
            overlay_gallery_max: 30, /* Maximum number of pictures in the overlay gallery */
            keyboard_shortcuts: true, /* Set to false if you open forms inside prettyPhoto */
            changepicturecallback: function () {
            }, /* Called everytime an item is shown/changed */
            callback: function () {
            }, /* Called when prettyPhoto is closed */
            ie6_fallback: true,
            markup: '<div class="pp_pic_holder"> \
						<div class="ppt">&nbsp;</div> \
						<div class="pp_top"> \
							<div class="pp_left"></div> \
							<div class="pp_middle"></div> \
							<div class="pp_right"></div> \
						</div> \
						<div class="pp_content_container"> \
							<div class="pp_left"> \
							<div class="pp_right"> \
								<div class="pp_content"> \
									<div class="pp_loaderIcon"></div> \
									<div class="pp_fade"> \
										<a href="#" class="pp_expand" title="Expand the image">Expand</a> \
										<div class="pp_hoverContainer"> \
											<a class="pp_next" href="#">next</a> \
											<a class="pp_previous" href="#">previous</a> \
										</div> \
										<div id="pp_full_res"></div> \
										<div class="pp_details"> \
											<div class="pp_nav"> \
												<a href="#" class="pp_arrow_previous">Previous</a> \
												<p class="currentTextHolder">0/0</p> \
												<a href="#" class="pp_arrow_next">Next</a> \
											</div> \
											<p class="pp_description"></p> \
											<div class="pp_social">{pp_social}</div> \
											<a class="pp_close" href="#">Close</a> \
										</div> \
									</div> \
								</div> \
							</div> \
							</div> \
						</div> \
						<div class="pp_bottom"> \
							<div class="pp_left"></div> \
							<div class="pp_middle"></div> \
							<div class="pp_right"></div> \
						</div> \
					</div> \
					<div class="pp_overlay"></div>',
            gallery_markup: '<div class="pp_gallery"> \
								<a href="#" class="pp_arrow_previous">Previous</a> \
								<div> \
									<ul> \
										{gallery} \
									</ul> \
								</div> \
								<a href="#" class="pp_arrow_next">Next</a> \
							</div>',
            image_markup: '<img id="fullResImage" src="{path}" />',
            flash_markup: '<object classid="clsid:D27CDB6E-AE6D-11cf-96B8-444553540000" width="{width}" height="{height}"><param name="wmode" value="{wmode}" /><param name="allowfullscreen" value="true" /><param name="allowscriptaccess" value="always" /><param name="movie" value="{path}" /><embed src="{path}" type="application/x-shockwave-flash" allowfullscreen="true" allowscriptaccess="always" width="{width}" height="{height}" wmode="{wmode}"></embed></object>',
            quicktime_markup: '<object classid="clsid:02BF25D5-8C17-4B23-BC80-D3488ABDDC6B" codebase="http://www.apple.com/qtactivex/qtplugin.cab" height="{height}" width="{width}"><param name="src" value="{path}"><param name="autoplay" value="{autoplay}"><param name="type" value="video/quicktime"><embed src="{path}" height="{height}" width="{width}" autoplay="{autoplay}" type="video/quicktime" pluginspage="http://www.apple.com/quicktime/download/"></embed></object>',
            iframe_markup: '<iframe src ="{path}" width="{width}" height="{height}" frameborder="no"></iframe>',
            inline_markup: '<div class="pp_inline">{content}</div>',
            custom_markup: '',
            social_tools: '<div class="twitter"><a href="http://twitter.com/share" class="twitter-share-button" data-count="none">Tweet</a><script type="text/javascript" src="http://platform.twitter.com/widgets.js"></script></div><div class="facebook"><iframe src="//www.facebook.com/plugins/like.php?locale=en_US&href={location_href}&amp;layout=button_count&amp;show_faces=true&amp;width=500&amp;action=like&amp;font&amp;colorscheme=light&amp;height=23" scrolling="no" frameborder="0" style="border:none; overflow:hidden; width:500px; height:23px;" allowTransparency="true"></iframe></div>' /* html or false to disable */
        }, pp_settings);

        // Global variables accessible only by prettyPhoto
        var matchedObjects = this, percentBased = false, pp_dimensions, pp_open,

            // prettyPhoto container specific
            pp_contentHeight, pp_contentWidth, pp_containerHeight, pp_containerWidth,

            // Window size
            windowHeight = $(window).height(), windowWidth = $(window).width(),

            // Global elements
            pp_slideshow;

        doresize = true, scroll_pos = _get_scroll();

        // Window/Keyboard events
        $(window).unbind('resize.prettyphoto').bind('resize.prettyphoto', function () {
            _center_overlay();
            _resize_overlay();
        });

        if (pp_settings.keyboard_shortcuts) {
            $(document).unbind('keydown.prettyphoto').bind('keydown.prettyphoto', function (e) {
                if (typeof $pp_pic_holder != 'undefined') {
                    if ($pp_pic_holder.is(':visible')) {
                        switch (e.keyCode) {
                            case 37:
                                $.prettyPhoto.changePage('previous');
                                e.preventDefault();
                                break;
                            case 39:
                                $.prettyPhoto.changePage('next');
                                e.preventDefault();
                                break;
                            case 27:
                                if (!settings.modal)
                                    $.prettyPhoto.close();
                                e.preventDefault();
                                break;
                        }
                        // return false;
                    }
                }
            });
        }
        /**
         * Initialize prettyPhoto.
         */
        $.prettyPhoto.initialize = function () {

            settings = pp_settings;

            if (settings.theme == 'pp_default') settings.horizontal_padding = 16;

            // Find out if the picture is part of a set
            theRel = $(this).attr(settings.hook);
            galleryRegExp = /\[(?:.*)\]/;
            isSet = (galleryRegExp.exec(theRel)) ? true : false;

            // Put the SRCs, TITLEs, ALTs into an array.
            pp_images = (isSet) ? jQuery.map(matchedObjects, function (n, i) {
                if ($(n).attr(settings.hook).indexOf(theRel) != -1) return $(n).attr('href');
            }) : $.makeArray($(this).attr('href'));
            pp_titles = (isSet) ? jQuery.map(matchedObjects, function (n, i) {
                if ($(n).attr(settings.hook).indexOf(theRel) != -1) return ($(n).find('img').attr('alt')) ? $(n).find('img').attr('alt') : "";
            }) : $.makeArray($(this).find('img').attr('alt'));
            pp_descriptions = (isSet) ? jQuery.map(matchedObjects, function (n, i) {
                if ($(n).attr(settings.hook).indexOf(theRel) != -1) return ($(n).attr('title')) ? $(n).attr('title') : "";
            }) : $.makeArray($(this).attr('title'));

            if (pp_images.length > settings.overlay_gallery_max) settings.overlay_gallery = false;

            set_position = jQuery.inArray($(this).attr('href'), pp_images); // Define where in the array the clicked item is positionned
            rel_index = (isSet) ? set_position : $("a[" + settings.hook + "^='" + theRel + "']").index($(this));

            _build_overlay(this); // Build the overlay {this} being the caller

            if (settings.allow_resize)
                $(window).bind('scroll.prettyphoto', function () {
                    _center_overlay();
                });


            $.prettyPhoto.open();

            return false;
        };


        /**
         * Opens the prettyPhoto modal box.
         * @param image {String,Array} Full path to the image to be open, can also be an array containing full images paths.
         * @param title {String,Array} The title to be displayed with the picture, can also be an array containing all the titles.
         * @param description {String,Array} The description to be displayed with the picture, can also be an array containing all the descriptions.
         */
        $.prettyPhoto.open = function (event) {
            if (typeof settings == "undefined") { // Means it's an API call, need to manually get the settings and set the variables
                settings = pp_settings;
                pp_images = $.makeArray(arguments[0]);
                pp_titles = (arguments[1]) ? $.makeArray(arguments[1]) : $.makeArray("");
                pp_descriptions = (arguments[2]) ? $.makeArray(arguments[2]) : $.makeArray("");
                isSet = (pp_images.length > 1) ? true : false;
                set_position = (arguments[3]) ? arguments[3] : 0;
                _build_overlay(event.target); // Build the overlay {this} being the caller
            }

            if (settings.hideflash) $('object,embed,iframe[src*=youtube],iframe[src*=vimeo]').css('visibility', 'hidden'); // Hide the flash

            _checkPosition($(pp_images).size()); // Hide the next/previous links if on first or last images.

            $('.pp_loaderIcon').show();

            if (settings.deeplinking)
                setHashtag();

            // Rebuild Facebook Like Button with updated href
            if (settings.social_tools) {
                facebook_like_link = settings.social_tools.replace('{location_href}', encodeURIComponent(location.href));
                $pp_pic_holder.find('.pp_social').html(facebook_like_link);
            }

            // Fade the content in
            if ($ppt.is(':hidden')) $ppt.css('opacity', 0).show();
            $pp_overlay.show().fadeTo(settings.animation_speed, settings.opacity);

            // Display the current position
            $pp_pic_holder.find('.currentTextHolder').text((set_position + 1) + settings.counter_separator_label + $(pp_images).size());

            // Set the description
            if (typeof pp_descriptions[set_position] != 'undefined' && pp_descriptions[set_position] != "") {
                $pp_pic_holder.find('.pp_description').show().html(unescape(pp_descriptions[set_position]));
            } else {
                $pp_pic_holder.find('.pp_description').hide();
            }

            // Get the dimensions
            movie_width = (parseFloat(getParam('width', pp_images[set_position]))) ? getParam('width', pp_images[set_position]) : settings.default_width.toString();
            movie_height = (parseFloat(getParam('height', pp_images[set_position]))) ? getParam('height', pp_images[set_position]) : settings.default_height.toString();

            // If the size is % based, calculate according to window dimensions
            percentBased = false;
            if (movie_height.indexOf('%') != -1) {
                movie_height = parseFloat(($(window).height() * parseFloat(movie_height) / 100) - 150);
                percentBased = true;
            }
            if (movie_width.indexOf('%') != -1) {
                movie_width = parseFloat(($(window).width() * parseFloat(movie_width) / 100) - 150);
                percentBased = true;
            }

            // Fade the holder
            $pp_pic_holder.fadeIn(function () {
                // Set the title
                (settings.show_title && pp_titles[set_position] != "" && typeof pp_titles[set_position] != "undefined") ? $ppt.html(unescape(pp_titles[set_position])) : $ppt.html('&nbsp;');

                imgPreloader = "";
                skipInjection = false;

                // Inject the proper content
                switch (_getFileType(pp_images[set_position])) {
                    case 'image':
                        imgPreloader = new Image();

                        // Preload the neighbour images
                        nextImage = new Image();
                        if (isSet && set_position < $(pp_images).size() - 1) nextImage.src = pp_images[set_position + 1];
                        prevImage = new Image();
                        if (isSet && pp_images[set_position - 1]) prevImage.src = pp_images[set_position - 1];

                        $pp_pic_holder.find('#pp_full_res')[0].innerHTML = settings.image_markup.replace(/{path}/g, pp_images[set_position]);

                        imgPreloader.onload = function () {
                            // Fit item to viewport
                            pp_dimensions = _fitToViewport(imgPreloader.width, imgPreloader.height);

                            _showContent();
                        };

                        imgPreloader.onerror = function () {
                            alert('Image cannot be loaded. Make sure the path is correct and image exist.');
                            $.prettyPhoto.close();
                        };

                        imgPreloader.src = pp_images[set_position];
                        break;

                    case 'youtube':
                        pp_dimensions = _fitToViewport(movie_width, movie_height); // Fit item to viewport

                        // Regular youtube link
                        movie_id = getParam('v', pp_images[set_position]);

                        // youtu.be link
                        if (movie_id == "") {
                            movie_id = pp_images[set_position].split('youtu.be/');
                            movie_id = movie_id[1];
                            if (movie_id.indexOf('?') > 0)
                                movie_id = movie_id.substr(0, movie_id.indexOf('?')); // Strip anything after the ?

                            if (movie_id.indexOf('&') > 0)
                                movie_id = movie_id.substr(0, movie_id.indexOf('&')); // Strip anything after the &
                        }

                        movie = 'http://www.youtube.com/embed/' + movie_id;
                        (getParam('rel', pp_images[set_position])) ? movie += "?rel=" + getParam('rel', pp_images[set_position]) : movie += "?rel=1";

                        if (settings.autoplay) movie += "&autoplay=1";

                        toInject = settings.iframe_markup.replace(/{width}/g, pp_dimensions['width']).replace(/{height}/g, pp_dimensions['height']).replace(/{wmode}/g, settings.wmode).replace(/{path}/g, movie);
                        break;

                    case 'vimeo':
                        pp_dimensions = _fitToViewport(movie_width, movie_height); // Fit item to viewport

                        movie_id = pp_images[set_position];
                        var regExp = /http(s?):\/\/(www\.)?vimeo.com\/(\d+)/;
                        var match = movie_id.match(regExp);

                        movie = 'http://player.vimeo.com/video/' + match[3] + '?title=0&amp;byline=0&amp;portrait=0';
                        if (settings.autoplay) movie += "&autoplay=1;";

                        vimeo_width = pp_dimensions['width'] + '/embed/?moog_width=' + pp_dimensions['width'];

                        toInject = settings.iframe_markup.replace(/{width}/g, vimeo_width).replace(/{height}/g, pp_dimensions['height']).replace(/{path}/g, movie);
                        break;

                    case 'quicktime':
                        pp_dimensions = _fitToViewport(movie_width, movie_height); // Fit item to viewport
                        pp_dimensions['height'] += 15;
                        pp_dimensions['contentHeight'] += 15;
                        pp_dimensions['containerHeight'] += 15; // Add space for the control bar

                        toInject = settings.quicktime_markup.replace(/{width}/g, pp_dimensions['width']).replace(/{height}/g, pp_dimensions['height']).replace(/{wmode}/g, settings.wmode).replace(/{path}/g, pp_images[set_position]).replace(/{autoplay}/g, settings.autoplay);
                        break;

                    case 'flash':
                        pp_dimensions = _fitToViewport(movie_width, movie_height); // Fit item to viewport

                        flash_vars = pp_images[set_position];
                        flash_vars = flash_vars.substring(pp_images[set_position].indexOf('flashvars') + 10, pp_images[set_position].length);

                        filename = pp_images[set_position];
                        filename = filename.substring(0, filename.indexOf('?'));

                        toInject = settings.flash_markup.replace(/{width}/g, pp_dimensions['width']).replace(/{height}/g, pp_dimensions['height']).replace(/{wmode}/g, settings.wmode).replace(/{path}/g, filename + '?' + flash_vars);
                        break;

                    case 'iframe':
                        pp_dimensions = _fitToViewport(movie_width, movie_height); // Fit item to viewport

                        frame_url = pp_images[set_position];
                        frame_url = frame_url.substr(0, frame_url.indexOf('iframe') - 1);

                        toInject = settings.iframe_markup.replace(/{width}/g, pp_dimensions['width']).replace(/{height}/g, pp_dimensions['height']).replace(/{path}/g, frame_url);
                        break;

                    case 'ajax':
                        doresize = false; // Make sure the dimensions are not resized.
                        pp_dimensions = _fitToViewport(movie_width, movie_height);
                        doresize = true; // Reset the dimensions

                        skipInjection = true;
                        $.get(pp_images[set_position], function (responseHTML) {
                            toInject = settings.inline_markup.replace(/{content}/g, responseHTML);
                            $pp_pic_holder.find('#pp_full_res')[0].innerHTML = toInject;
                            _showContent();
                        });

                        break;

                    case 'custom':
                        pp_dimensions = _fitToViewport(movie_width, movie_height); // Fit item to viewport

                        toInject = settings.custom_markup;
                        break;

                    case 'inline':
                        // to get the item height clone it, apply default width, wrap it in the prettyPhoto containers , then delete
                        myClone = $(pp_images[set_position]).clone().append('<br clear="all" />').css({'width': settings.default_width}).wrapInner('<div id="pp_full_res"><div class="pp_inline"></div></div>').appendTo($('body')).show();
                        doresize = false; // Make sure the dimensions are not resized.
                        pp_dimensions = _fitToViewport($(myClone).width(), $(myClone).height());
                        doresize = true; // Reset the dimensions
                        $(myClone).remove();
                        toInject = settings.inline_markup.replace(/{content}/g, $(pp_images[set_position]).html());
                        break;
                }
                if (!imgPreloader && !skipInjection) {
                    $pp_pic_holder.find('#pp_full_res')[0].innerHTML = toInject;

                    // Show content
                    _showContent();
                }
            });

            return false;
        };


        /**
         * Change page in the prettyPhoto modal box
         * @param direction {String} Direction of the paging, previous or next.
         */
        $.prettyPhoto.changePage = function (direction) {
            currentGalleryPage = 0;

            if (direction == 'previous') {
                set_position--;
                if (set_position < 0) set_position = $(pp_images).size() - 1;
            } else if (direction == 'next') {
                set_position++;
                if (set_position > $(pp_images).size() - 1) set_position = 0;
            } else {
                set_position = direction;
            }
            rel_index = set_position;

            if (!doresize) doresize = true; // Allow the resizing of the images
            if (settings.allow_expand) {
                $('.pp_contract').removeClass('pp_contract').addClass('pp_expand');
            }

            _hideContent(function () {
                $.prettyPhoto.open();
            });
        };


        /**
         * Change gallery page in the prettyPhoto modal box
         * @param direction {String} Direction of the paging, previous or next.
         */
        $.prettyPhoto.changeGalleryPage = function (direction) {
            if (direction == 'next') {
                currentGalleryPage++;

                if (currentGalleryPage > totalPage) currentGalleryPage = 0;
            } else if (direction == 'previous') {
                currentGalleryPage--;

                if (currentGalleryPage < 0) currentGalleryPage = totalPage;
            } else {
                currentGalleryPage = direction;
            }
            slide_speed = (direction == 'next' || direction == 'previous') ? settings.animation_speed : 0;

            slide_to = currentGalleryPage * (itemsPerPage * itemWidth);

            $pp_gallery.find('ul').animate({left: -slide_to}, slide_speed);
        };


        /**
         * Start the slideshow...
         */
        $.prettyPhoto.startSlideshow = function () {
            if (typeof pp_slideshow == 'undefined') {
                $pp_pic_holder.find('.pp_play').unbind('click').removeClass('pp_play').addClass('pp_pause').click(function () {
                    $.prettyPhoto.stopSlideshow();
                    return false;
                });
                pp_slideshow = setInterval($.prettyPhoto.startSlideshow, settings.slideshow);
            } else {
                $.prettyPhoto.changePage('next');
            }
        };


        /**
         * Stop the slideshow...
         */
        $.prettyPhoto.stopSlideshow = function () {
            $pp_pic_holder.find('.pp_pause').unbind('click').removeClass('pp_pause').addClass('pp_play').click(function () {
                $.prettyPhoto.startSlideshow();
                return false;
            });
            clearInterval(pp_slideshow);
            pp_slideshow = undefined;
        };


        /**
         * Closes prettyPhoto.
         */
        $.prettyPhoto.close = function () {
            if ($pp_overlay.is(":animated")) return;

            $.prettyPhoto.stopSlideshow();

            $pp_pic_holder.stop().find('object,embed').css('visibility', 'hidden');

            $('div.pp_pic_holder,div.ppt,.pp_fade').fadeOut(settings.animation_speed, function () {
                $(this).remove();
            });

            $pp_overlay.fadeOut(settings.animation_speed, function () {

                if (settings.hideflash) $('object,embed,iframe[src*=youtube],iframe[src*=vimeo]').css('visibility', 'visible'); // Show the flash

                $(this).remove(); // No more need for the prettyPhoto markup

                $(window).unbind('scroll.prettyphoto');

                clearHashtag();

                settings.callback();

                doresize = true;

                pp_open = false;

                delete settings;
            });
        };

        /**
         * Set the proper sizes on the containers and animate the content in.
         */
        function _showContent() {
            $('.pp_loaderIcon').hide();

            // Calculate the opened top position of the pic holder
            projectedTop = scroll_pos['scrollTop'] + ((windowHeight / 2) - (pp_dimensions['containerHeight'] / 2));
            if (projectedTop < 0) projectedTop = 0;

            $ppt.fadeTo(settings.animation_speed, 1);

            // Resize the content holder
            $pp_pic_holder.find('.pp_content')
                .animate({
                    height: pp_dimensions['contentHeight'],
                    width: pp_dimensions['contentWidth']
                }, settings.animation_speed);

            // Resize picture the holder
            $pp_pic_holder.animate({
                'top': projectedTop,
                'left': ((windowWidth / 2) - (pp_dimensions['containerWidth'] / 2) < 0) ? 0 : (windowWidth / 2) - (pp_dimensions['containerWidth'] / 2),
                width: pp_dimensions['containerWidth']
            }, settings.animation_speed, function () {
                $pp_pic_holder.find('.pp_hoverContainer,#fullResImage').height(pp_dimensions['height']).width(pp_dimensions['width']);

                $pp_pic_holder.find('.pp_fade').fadeIn(settings.animation_speed); // Fade the new content

                // Show the nav
                if (isSet && _getFileType(pp_images[set_position]) == "image") {
                    $pp_pic_holder.find('.pp_hoverContainer').show();
                } else {
                    $pp_pic_holder.find('.pp_hoverContainer').hide();
                }

                if (settings.allow_expand) {
                    if (pp_dimensions['resized']) { // Fade the resizing link if the image is resized
                        $('a.pp_expand,a.pp_contract').show();
                    } else {
                        $('a.pp_expand').hide();
                    }
                }

                if (settings.autoplay_slideshow && !pp_slideshow && !pp_open) $.prettyPhoto.startSlideshow();

                settings.changepicturecallback(); // Callback!

                pp_open = true;
            });

            _insert_gallery();
            pp_settings.ajaxcallback();
        }

        /**
         * Hide the content...DUH!
         */
        function _hideContent(callback) {
            // Fade out the current picture
            $pp_pic_holder.find('#pp_full_res object,#pp_full_res embed').css('visibility', 'hidden');
            $pp_pic_holder.find('.pp_fade').fadeOut(settings.animation_speed, function () {
                $('.pp_loaderIcon').show();

                callback();
            });
        }

        /**
         * Check the item position in the gallery array, hide or show the navigation links
         * @param setCount {integer} The total number of items in the set
         */
        function _checkPosition(setCount) {
            (setCount > 1) ? $('.pp_nav').show() : $('.pp_nav').hide(); // Hide the bottom nav if it's not a set.
        }

        /**
         * Resize the item dimensions if it's bigger than the viewport
         * @param width {integer} Width of the item to be opened
         * @param height {integer} Height of the item to be opened
         * @return An array containin the "fitted" dimensions
         */
        function _fitToViewport(width, height) {
            resized = false;

            _getDimensions(width, height);

            // Define them in case there's no resize needed
            imageWidth = width, imageHeight = height;

            if (((pp_containerWidth > windowWidth) || (pp_containerHeight > windowHeight)) && doresize && settings.allow_resize && !percentBased) {
                resized = true, fitting = false;

                while (!fitting) {
                    if ((pp_containerWidth > windowWidth)) {
                        imageWidth = (windowWidth - 200);
                        imageHeight = (height / width) * imageWidth;
                    } else if ((pp_containerHeight > windowHeight)) {
                        imageHeight = (windowHeight - 200);
                        imageWidth = (width / height) * imageHeight;
                    } else {
                        fitting = true;
                    }
                    pp_containerHeight = imageHeight, pp_containerWidth = imageWidth;
                }
                if ((pp_containerWidth > windowWidth) || (pp_containerHeight > windowHeight)) {
                    _fitToViewport(pp_containerWidth, pp_containerHeight)
                }
                _getDimensions(imageWidth, imageHeight);
            }
            return {
                width: Math.floor(imageWidth),
                height: Math.floor(imageHeight),
                containerHeight: Math.floor(pp_containerHeight),
                containerWidth: Math.floor(pp_containerWidth) + (settings.horizontal_padding * 2),
                contentHeight: Math.floor(pp_contentHeight),
                contentWidth: Math.floor(pp_contentWidth),
                resized: resized
            };
        }

        /**
         * Get the containers dimensions according to the item size
         * @param width {integer} Width of the item to be opened
         * @param height {integer} Height of the item to be opened
         */
        function _getDimensions(width, height) {
            width = parseFloat(width);
            height = parseFloat(height);

            // Get the details height, to do so, I need to clone it since it's invisible
            $pp_details = $pp_pic_holder.find('.pp_details');
            $pp_details.width(width);
            detailsHeight = parseFloat($pp_details.css('marginTop')) + parseFloat($pp_details.css('marginBottom'));

            $pp_details = $pp_details.clone().addClass(settings.theme).width(width).appendTo($('body')).css({
                'position': 'absolute',
                'top': -10000
            });
            detailsHeight += $pp_details.height();
            detailsHeight = (detailsHeight <= 34) ? 36 : detailsHeight; // Min-height for the details
            $pp_details.remove();

            // Get the titles height, to do so, I need to clone it since it's invisible
            $pp_title = $pp_pic_holder.find('.ppt');
            $pp_title.width(width);
            titleHeight = parseFloat($pp_title.css('marginTop')) + parseFloat($pp_title.css('marginBottom'));
            $pp_title = $pp_title.clone().appendTo($('body')).css({
                'position': 'absolute',
                'top': -10000
            });
            titleHeight += $pp_title.height();
            $pp_title.remove();

            // Get the container size, to resize the holder to the right dimensions
            pp_contentHeight = height + detailsHeight;
            pp_contentWidth = width;
            pp_containerHeight = pp_contentHeight + titleHeight + $pp_pic_holder.find('.pp_top').height() + $pp_pic_holder.find('.pp_bottom').height();
            pp_containerWidth = width;
        }

        function _getFileType(itemSrc) {
            if (itemSrc.match(/youtube\.com\/watch/i) || itemSrc.match(/youtu\.be/i)) {
                return 'youtube';
            } else if (itemSrc.match(/vimeo\.com/i)) {
                return 'vimeo';
            } else if (itemSrc.match(/\b.mov\b/i)) {
                return 'quicktime';
            } else if (itemSrc.match(/\b.swf\b/i)) {
                return 'flash';
            } else if (itemSrc.match(/\biframe=true\b/i)) {
                return 'iframe';
            } else if (itemSrc.match(/\bajax=true\b/i)) {
                return 'ajax';
            } else if (itemSrc.match(/\bcustom=true\b/i)) {
                return 'custom';
            } else if (itemSrc.substr(0, 1) == '#') {
                return 'inline';
            } else {
                return 'image';
            }
        }

        function _center_overlay() {
            if (doresize && typeof $pp_pic_holder != 'undefined') {
                scroll_pos = _get_scroll();
                contentHeight = $pp_pic_holder.height(), contentwidth = $pp_pic_holder.width();

                projectedTop = (windowHeight / 2) + scroll_pos['scrollTop'] - (contentHeight / 2);
                if (projectedTop < 0) projectedTop = 0;

                if (contentHeight > windowHeight)
                    return;

                $pp_pic_holder.css({
                    'top': projectedTop,
                    'left': (windowWidth / 2) + scroll_pos['scrollLeft'] - (contentwidth / 2)
                });
            }
        }

        function _get_scroll() {
            if (self.pageYOffset) {
                return {scrollTop: self.pageYOffset, scrollLeft: self.pageXOffset};
            } else if (document.documentElement && document.documentElement.scrollTop) { // Explorer 6 Strict
                return {scrollTop: document.documentElement.scrollTop, scrollLeft: document.documentElement.scrollLeft};
            } else if (document.body) {// all other Explorers
                return {scrollTop: document.body.scrollTop, scrollLeft: document.body.scrollLeft};
            }
        }

        function _resize_overlay() {
            windowHeight = $(window).height(), windowWidth = $(window).width();

            if (typeof $pp_overlay != "undefined") $pp_overlay.height($(document).height()).width(windowWidth);
        }

        function _insert_gallery() {
            if (isSet && settings.overlay_gallery && _getFileType(pp_images[set_position]) == "image") {
                itemWidth = 52 + 5; // 52 beign the thumb width, 5 being the right margin.
                navWidth = (settings.theme == "facebook" || settings.theme == "pp_default") ? 50 : 30; // Define the arrow width depending on the theme

                itemsPerPage = Math.floor((pp_dimensions['containerWidth'] - 100 - navWidth) / itemWidth);
                itemsPerPage = (itemsPerPage < pp_images.length) ? itemsPerPage : pp_images.length;
                totalPage = Math.ceil(pp_images.length / itemsPerPage) - 1;

                // Hide the nav in the case there's no need for links
                if (totalPage == 0) {
                    navWidth = 0; // No nav means no width!
                    $pp_gallery.find('.pp_arrow_next,.pp_arrow_previous').hide();
                } else {
                    $pp_gallery.find('.pp_arrow_next,.pp_arrow_previous').show();
                }
                galleryWidth = itemsPerPage * itemWidth;
                fullGalleryWidth = pp_images.length * itemWidth;

                // Set the proper width to the gallery items
                $pp_gallery
                    .css('margin-left', -((galleryWidth / 2) + (navWidth / 2)))
                    .find('div:first').width(galleryWidth + 5)
                    .find('ul').width(fullGalleryWidth)
                    .find('li.selected').removeClass('selected');

                goToPage = (Math.floor(set_position / itemsPerPage) < totalPage) ? Math.floor(set_position / itemsPerPage) : totalPage;

                $.prettyPhoto.changeGalleryPage(goToPage);

                $pp_gallery_li.filter(':eq(' + set_position + ')').addClass('selected');
            } else {
                $pp_pic_holder.find('.pp_content').unbind('mouseenter mouseleave');
                // $pp_gallery.hide();
            }
        }

        function _build_overlay(caller) {
            // Inject Social Tool markup into General markup
            if (settings.social_tools)
                facebook_like_link = settings.social_tools.replace('{location_href}', encodeURIComponent(location.href));

            settings.markup = settings.markup.replace('{pp_social}', '');

            $('body').append(settings.markup); // Inject the markup

            $pp_pic_holder = $('.pp_pic_holder') , $ppt = $('.ppt'), $pp_overlay = $('div.pp_overlay'); // Set my global selectors

            // Inject the inline gallery!
            if (isSet && settings.overlay_gallery) {
                currentGalleryPage = 0;
                toInject = "";
                for (var i = 0; i < pp_images.length; i++) {
                    if (!pp_images[i].match(/\b(jpg|jpeg|png|gif)\b/gi)) {
                        classname = 'default';
                        img_src = '';
                    } else {
                        classname = '';
                        img_src = pp_images[i];
                    }
                    toInject += "<li class='" + classname + "'><a href='#'><img src='" + img_src + "' width='50' alt='' /></a></li>";
                }
                toInject = settings.gallery_markup.replace(/{gallery}/g, toInject);

                $pp_pic_holder.find('#pp_full_res').after(toInject);

                $pp_gallery = $('.pp_pic_holder .pp_gallery'), $pp_gallery_li = $pp_gallery.find('li'); // Set the gallery selectors

                $pp_gallery.find('.pp_arrow_next').click(function () {
                    $.prettyPhoto.changeGalleryPage('next');
                    $.prettyPhoto.stopSlideshow();
                    return false;
                });

                $pp_gallery.find('.pp_arrow_previous').click(function () {
                    $.prettyPhoto.changeGalleryPage('previous');
                    $.prettyPhoto.stopSlideshow();
                    return false;
                });

                $pp_pic_holder.find('.pp_content').hover(
                    function () {
                        $pp_pic_holder.find('.pp_gallery:not(.disabled)').fadeIn();
                    },
                    function () {
                        $pp_pic_holder.find('.pp_gallery:not(.disabled)').fadeOut();
                    });

                itemWidth = 52 + 5; // 52 beign the thumb width, 5 being the right margin.
                $pp_gallery_li.each(function (i) {
                    $(this)
                        .find('a')
                        .click(function () {
                            $.prettyPhoto.changePage(i);
                            $.prettyPhoto.stopSlideshow();
                            return false;
                        });
                });
            }
            // Inject the play/pause if it's a slideshow
            if (settings.slideshow) {
                $pp_pic_holder.find('.pp_nav').prepend('<a href="#" class="pp_play">Play</a>');
                $pp_pic_holder.find('.pp_nav .pp_play').click(function () {
                    $.prettyPhoto.startSlideshow();
                    return false;
                });
            }

            $pp_pic_holder.attr('class', 'pp_pic_holder ' + settings.theme); // Set the proper theme

            $pp_overlay
                .css({
                    'opacity': 0,
                    'height': $(document).height(),
                    'width': $(window).width()
                })
                .bind('click', function () {
                    if (!settings.modal) $.prettyPhoto.close();
                });

            $('a.pp_close').bind('click', function () {
                $.prettyPhoto.close();
                return false;
            });


            if (settings.allow_expand) {
                $('a.pp_expand').bind('click', function (e) {
                    // Expand the image
                    if ($(this).hasClass('pp_expand')) {
                        $(this).removeClass('pp_expand').addClass('pp_contract');
                        doresize = false;
                    } else {
                        $(this).removeClass('pp_contract').addClass('pp_expand');
                        doresize = true;
                    }
                    _hideContent(function () {
                        $.prettyPhoto.open();
                    });

                    return false;
                });
            }

            $pp_pic_holder.find('.pp_previous, .pp_nav .pp_arrow_previous').bind('click', function () {
                $.prettyPhoto.changePage('previous');
                $.prettyPhoto.stopSlideshow();
                return false;
            });

            $pp_pic_holder.find('.pp_next, .pp_nav .pp_arrow_next').bind('click', function () {
                $.prettyPhoto.changePage('next');
                $.prettyPhoto.stopSlideshow();
                return false;
            });

            _center_overlay(); // Center it
        }

        if (!pp_alreadyInitialized && getHashtag()) {
            pp_alreadyInitialized = true;

            // Grab the rel index to trigger the click on the correct element
            hashIndex = getHashtag();
            hashRel = hashIndex;
            hashIndex = hashIndex.substring(hashIndex.indexOf('/') + 1, hashIndex.length - 1);
            hashRel = hashRel.substring(0, hashRel.indexOf('/'));

            // Little timeout to make sure all the prettyPhoto initialize scripts has been run.
            // Useful in the event the page contain several init scripts.
            setTimeout(function () {
                $("a[" + pp_settings.hook + "^='" + hashRel + "']:eq(" + hashIndex + ")").trigger('click');
            }, 50);
        }

        return this.unbind('click.prettyphoto').bind('click.prettyphoto', $.prettyPhoto.initialize); // Return the jQuery object for chaining. The unbind method is used to avoid click conflict when the plugin is called more than once
    };

    function getHashtag() {
        var url = location.href;
        hashtag = (url.indexOf('#prettyPhoto') !== -1) ? decodeURI(url.substring(url.indexOf('#prettyPhoto') + 1, url.length)) : false;
        if (hashtag) {
            hashtag = hashtag.replace(/<|>/g, '');
        }
        return hashtag;
    }

    function setHashtag() {
        if (typeof theRel == 'undefined') return; // theRel is set on normal calls, it's impossible to deeplink using the API
        location.hash = theRel + '/' + rel_index + '/';
    }

    function clearHashtag() {
        if (location.href.indexOf('#prettyPhoto') !== -1) location.hash = "prettyPhoto";
    }

    function getParam(name, url) {
        name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
        var regexS = "[\\?&]" + name + "=([^&#]*)";
        var regex = new RegExp(regexS);
        var results = regex.exec(url);
        return (results == null) ? "" : results[1];
    }

})(jQuery);

var pp_alreadyInitialized = false; // Used for the deep linking to make sure not to call the same function several times.

/*
 *  jquery Stellar parallax
 * -----------------------------------------------
 */
/*
/*! Stellar.js v0.6.2 | Copyright 2014, Mark Dalgleish | http://markdalgleish.com/projects/stellar.js | http://markdalgleish.mit-license.org */
!function (a, b, c, d) {
    function e(b, c) {
        this.element = b, this.options = a.extend({}, g, c), this._defaults = g, this._name = f, this.init()
    }

    var f = "stellar",
        g = {
            scrollProperty: "scroll",
            positionProperty: "position",
            horizontalScrolling: !0,
            verticalScrolling: !0,
            horizontalOffset: 0,
            verticalOffset: 0,
            responsive: !1,
            parallaxBackgrounds: !0,
            parallaxElements: !0,
            hideDistantElements: !0,
            hideElement: function (a) {
                a.hide()
            },
            showElement: function (a) {
                a.show()
            }
        },
        h = {
            scroll: {
                getLeft: function (a) {
                    return a.scrollLeft()
                },
                setLeft: function (a, b) {
                    a.scrollLeft(b)
                },
                getTop: function (a) {
                    return a.scrollTop()
                },
                setTop: function (a, b) {
                    a.scrollTop(b)
                }
            },
            position: {
                getLeft: function (a) {
                    return -1 * parseInt(a.css("left"), 10)
                },
                getTop: function (a) {
                    return -1 * parseInt(a.css("top"), 10)
                }
            },
            margin: {
                getLeft: function (a) {
                    return -1 * parseInt(a.css("margin-left"), 10)
                },
                getTop: function (a) {
                    return -1 * parseInt(a.css("margin-top"), 10)
                }
            },
            transform: {
                getLeft: function (a) {
                    var b = getComputedStyle(a[0])[k];
                    return "none" !== b ? -1 * parseInt(b.match(/(-?[0-9]+)/g)[4], 10) : 0
                },
                getTop: function (a) {
                    var b = getComputedStyle(a[0])[k];
                    return "none" !== b ? -1 * parseInt(b.match(/(-?[0-9]+)/g)[5], 10) : 0
                }
            }
        },
        i = {
            position: {
                setLeft: function (a, b) {
                    a.css("left", b)
                },
                setTop: function (a, b) {
                    a.css("top", b)
                }
            },
            transform: {
                setPosition: function (a, b, c, d, e) {
                    a[0].style[k] = "translate3d(" + (b - c) + "px, " + (d - e) + "px, 0)"
                }
            }
        },
        j = function () {
            var b, c = /^(Moz|Webkit|Khtml|O|ms|Icab)(?=[A-Z])/,
                d = a("script")[0].style,
                e = "";
            for (b in d)
                if (c.test(b)) {
                    e = b.match(c)[0];
                    break
                }
            return "WebkitOpacity" in d && (e = "Webkit"), "KhtmlOpacity" in d && (e = "Khtml"),
                function (a) {
                    return e + (e.length > 0 ? a.charAt(0).toUpperCase() + a.slice(1) : a)
                }
        }(),
        k = j("transform"),
        l = a("<div />", {
            style: "background:#fff"
        }).css("background-position-x") !== d,
        m = l ? function (a, b, c) {
            a.css({
                "background-position-x": b,
                "background-position-y": c
            })
        } : function (a, b, c) {
            a.css("background-position", b + " " + c)
        },
        n = l ? function (a) {
            return [a.css("background-position-x"), a.css("background-position-y")]
        } : function (a) {
            return a.css("background-position").split(" ")
        },
        o = b.requestAnimationFrame || b.webkitRequestAnimationFrame || b.mozRequestAnimationFrame || b.oRequestAnimationFrame || b.msRequestAnimationFrame || function (a) {
            setTimeout(a, 1e3 / 60)
        };
    e.prototype = {
        init: function () {
            this.options.name = f + "_" + Math.floor(1e9 * Math.random()), this._defineElements(), this._defineGetters(), this._defineSetters(), this._handleWindowLoadAndResize(), this.refresh({
                firstLoad: !0
            }), "scroll" === this.options.scrollProperty ? this._handleScrollEvent() : this._startAnimationLoop()
        },
        _defineElements: function () {
            this.element === c.body && (this.element = b), this.$scrollElement = a(this.element), this.$element = this.element === b ? a("body") : this.$scrollElement, this.$viewportElement = this.options.viewportElement !== d ? a(this.options.viewportElement) : this.$scrollElement[0] === b || "scroll" === this.options.scrollProperty ? this.$scrollElement : this.$scrollElement.parent()
        },
        _defineGetters: function () {
            var a = this,
                b = h[a.options.scrollProperty];
            this._getScrollLeft = function () {
                return b.getLeft(a.$scrollElement)
            }, this._getScrollTop = function () {
                return b.getTop(a.$scrollElement)
            }
        },
        _defineSetters: function () {
            var b = this,
                c = h[b.options.scrollProperty],
                d = i[b.options.positionProperty],
                e = c.setLeft,
                f = c.setTop;
            this._setScrollLeft = "function" == typeof e ? function (a) {
                e(b.$scrollElement, a)
            } : a.noop, this._setScrollTop = "function" == typeof f ? function (a) {
                f(b.$scrollElement, a)
            } : a.noop, this._setPosition = d.setPosition || function (a, c, e, f, g) {
                b.options.horizontalScrolling && d.setLeft(a, c, e), b.options.verticalScrolling && d.setTop(a, f, g)
            }
        },
        _handleWindowLoadAndResize: function () {
            var c = this,
                d = a(b);
            c.options.responsive && d.bind("load." + this.name, function () {
                c.refresh()
            }), d.bind("resize." + this.name, function () {
                c.options.responsive && c.refresh()
            })
        },
        refresh: function (c) {
            var d = this,
                e = d._getScrollLeft(),
                f = d._getScrollTop();
            c && c.firstLoad || this._reset(), this._setScrollLeft(0), this._setScrollTop(0), this._setOffsets(), this._findParticles(), this._findBackgrounds(), c && c.firstLoad && /WebKit/.test(navigator.userAgent) && a(b).load(function () {
                var a = d._getScrollLeft(),
                    b = d._getScrollTop();
                d._setScrollLeft(a + 1), d._setScrollTop(b + 1), d._setScrollLeft(a), d._setScrollTop(b)
            }), this._setScrollLeft(e), this._setScrollTop(f)
        },
        _findParticles: function () {
            {
                var b = this;
                this._getScrollLeft(), this._getScrollTop()
            }
            if (this.particles !== d)
                for (var c = this.particles.length - 1; c >= 0; c--) this.particles[c].$element.data("stellar-elementIsActive", d);
            this.particles = [], this.options.parallaxElements && this.$element.find("[data-stellar-ratio]").each(function () {
                var c, e, f, g, h, i, j, k, l, m = a(this),
                    n = 0,
                    o = 0,
                    p = 0,
                    q = 0;
                if (m.data("stellar-elementIsActive")) {
                    if (m.data("stellar-elementIsActive") !== this) return
                } else m.data("stellar-elementIsActive", this);
                b.options.showElement(m), m.data("stellar-startingLeft") ? (m.css("left", m.data("stellar-startingLeft")), m.css("top", m.data("stellar-startingTop"))) : (m.data("stellar-startingLeft", m.css("left")), m.data("stellar-startingTop", m.css("top"))), f = m.position().left, g = m.position().top, h = "auto" === m.css("margin-left") ? 0 : parseInt(m.css("margin-left"), 10), i = "auto" === m.css("margin-top") ? 0 : parseInt(m.css("margin-top"), 10), k = m.offset().left - h, l = m.offset().top - i, m.parents().each(function () {
                    var b = a(this);
                    return b.data("stellar-offset-parent") === !0 ? (n = p, o = q, j = b, !1) : (p += b.position().left, void(q += b.position().top))
                }), c = m.data("stellar-horizontal-offset") !== d ? m.data("stellar-horizontal-offset") : j !== d && j.data("stellar-horizontal-offset") !== d ? j.data("stellar-horizontal-offset") : b.horizontalOffset, e = m.data("stellar-vertical-offset") !== d ? m.data("stellar-vertical-offset") : j !== d && j.data("stellar-vertical-offset") !== d ? j.data("stellar-vertical-offset") : b.verticalOffset, b.particles.push({
                    $element: m,
                    $offsetParent: j,
                    isFixed: "fixed" === m.css("position"),
                    horizontalOffset: c,
                    verticalOffset: e,
                    startingPositionLeft: f,
                    startingPositionTop: g,
                    startingOffsetLeft: k,
                    startingOffsetTop: l,
                    parentOffsetLeft: n,
                    parentOffsetTop: o,
                    stellarRatio: m.data("stellar-ratio") !== d ? m.data("stellar-ratio") : 1,
                    width: m.outerWidth(!0),
                    height: m.outerHeight(!0),
                    isHidden: !1
                })
            })
        },
        _findBackgrounds: function () {
            var b, c = this,
                e = this._getScrollLeft(),
                f = this._getScrollTop();
            this.backgrounds = [], this.options.parallaxBackgrounds && (b = this.$element.find("[data-stellar-background-ratio]"), this.$element.data("stellar-background-ratio") && (b = b.add(this.$element)), b.each(function () {
                var b, g, h, i, j, k, l, o = a(this),
                    p = n(o),
                    q = 0,
                    r = 0,
                    s = 0,
                    t = 0;
                if (o.data("stellar-backgroundIsActive")) {
                    if (o.data("stellar-backgroundIsActive") !== this) return
                } else o.data("stellar-backgroundIsActive", this);
                o.data("stellar-backgroundStartingLeft") ? m(o, o.data("stellar-backgroundStartingLeft"), o.data("stellar-backgroundStartingTop")) : (o.data("stellar-backgroundStartingLeft", p[0]), o.data("stellar-backgroundStartingTop", p[1])), h = "auto" === o.css("margin-left") ? 0 : parseInt(o.css("margin-left"), 10), i = "auto" === o.css("margin-top") ? 0 : parseInt(o.css("margin-top"), 10), j = o.offset().left - h - e, k = o.offset().top - i - f, o.parents().each(function () {
                    var b = a(this);
                    return b.data("stellar-offset-parent") === !0 ? (q = s, r = t, l = b, !1) : (s += b.position().left, void(t += b.position().top))
                }), b = o.data("stellar-horizontal-offset") !== d ? o.data("stellar-horizontal-offset") : l !== d && l.data("stellar-horizontal-offset") !== d ? l.data("stellar-horizontal-offset") : c.horizontalOffset, g = o.data("stellar-vertical-offset") !== d ? o.data("stellar-vertical-offset") : l !== d && l.data("stellar-vertical-offset") !== d ? l.data("stellar-vertical-offset") : c.verticalOffset, c.backgrounds.push({
                    $element: o,
                    $offsetParent: l,
                    isFixed: "fixed" === o.css("background-attachment"),
                    horizontalOffset: b,
                    verticalOffset: g,
                    startingValueLeft: p[0],
                    startingValueTop: p[1],
                    startingBackgroundPositionLeft: isNaN(parseInt(p[0], 10)) ? 0 : parseInt(p[0], 10),
                    startingBackgroundPositionTop: isNaN(parseInt(p[1], 10)) ? 0 : parseInt(p[1], 10),
                    startingPositionLeft: o.position().left,
                    startingPositionTop: o.position().top,
                    startingOffsetLeft: j,
                    startingOffsetTop: k,
                    parentOffsetLeft: q,
                    parentOffsetTop: r,
                    stellarRatio: o.data("stellar-background-ratio") === d ? 1 : o.data("stellar-background-ratio")
                })
            }))
        },
        _reset: function () {
            var a, b, c, d, e;
            for (e = this.particles.length - 1; e >= 0; e--) a = this.particles[e], b = a.$element.data("stellar-startingLeft"), c = a.$element.data("stellar-startingTop"), this._setPosition(a.$element, b, b, c, c), this.options.showElement(a.$element), a.$element.data("stellar-startingLeft", null).data("stellar-elementIsActive", null).data("stellar-backgroundIsActive", null);
            for (e = this.backgrounds.length - 1; e >= 0; e--) d = this.backgrounds[e], d.$element.data("stellar-backgroundStartingLeft", null).data("stellar-backgroundStartingTop", null), m(d.$element, d.startingValueLeft, d.startingValueTop)
        },
        destroy: function () {
            this._reset(), this.$scrollElement.unbind("resize." + this.name).unbind("scroll." + this.name), this._animationLoop = a.noop, a(b).unbind("load." + this.name).unbind("resize." + this.name)
        },
        _setOffsets: function () {
            var c = this,
                d = a(b);
            d.unbind("resize.horizontal-" + this.name).unbind("resize.vertical-" + this.name), "function" == typeof this.options.horizontalOffset ? (this.horizontalOffset = this.options.horizontalOffset(), d.bind("resize.horizontal-" + this.name, function () {
                c.horizontalOffset = c.options.horizontalOffset()
            })) : this.horizontalOffset = this.options.horizontalOffset, "function" == typeof this.options.verticalOffset ? (this.verticalOffset = this.options.verticalOffset(), d.bind("resize.vertical-" + this.name, function () {
                c.verticalOffset = c.options.verticalOffset()
            })) : this.verticalOffset = this.options.verticalOffset
        },
        _repositionElements: function () {
            var a, b, c, d, e, f, g, h, i, j, k = this._getScrollLeft(),
                l = this._getScrollTop(),
                n = !0,
                o = !0;
            if (this.currentScrollLeft !== k || this.currentScrollTop !== l || this.currentWidth !== this.viewportWidth || this.currentHeight !== this.viewportHeight) {
                for (this.currentScrollLeft = k, this.currentScrollTop = l, this.currentWidth = this.viewportWidth, this.currentHeight = this.viewportHeight, j = this.particles.length - 1; j >= 0; j--) a = this.particles[j], b = a.isFixed ? 1 : 0, this.options.horizontalScrolling ? (f = (k + a.horizontalOffset + this.viewportOffsetLeft + a.startingPositionLeft - a.startingOffsetLeft + a.parentOffsetLeft) * -(a.stellarRatio + b - 1) + a.startingPositionLeft, h = f - a.startingPositionLeft + a.startingOffsetLeft) : (f = a.startingPositionLeft, h = a.startingOffsetLeft), this.options.verticalScrolling ? (g = (l + a.verticalOffset + this.viewportOffsetTop + a.startingPositionTop - a.startingOffsetTop + a.parentOffsetTop) * -(a.stellarRatio + b - 1) + a.startingPositionTop, i = g - a.startingPositionTop + a.startingOffsetTop) : (g = a.startingPositionTop, i = a.startingOffsetTop), this.options.hideDistantElements && (o = !this.options.horizontalScrolling || h + a.width > (a.isFixed ? 0 : k) && h < (a.isFixed ? 0 : k) + this.viewportWidth + this.viewportOffsetLeft, n = !this.options.verticalScrolling || i + a.height > (a.isFixed ? 0 : l) && i < (a.isFixed ? 0 : l) + this.viewportHeight + this.viewportOffsetTop), o && n ? (a.isHidden && (this.options.showElement(a.$element), a.isHidden = !1), this._setPosition(a.$element, f, a.startingPositionLeft, g, a.startingPositionTop)) : a.isHidden || (this.options.hideElement(a.$element), a.isHidden = !0);
                for (j = this.backgrounds.length - 1; j >= 0; j--) c = this.backgrounds[j], b = c.isFixed ? 0 : 1, d = this.options.horizontalScrolling ? (k + c.horizontalOffset - this.viewportOffsetLeft - c.startingOffsetLeft + c.parentOffsetLeft - c.startingBackgroundPositionLeft) * (b - c.stellarRatio) + "px" : c.startingValueLeft, e = this.options.verticalScrolling ? (l + c.verticalOffset - this.viewportOffsetTop - c.startingOffsetTop + c.parentOffsetTop - c.startingBackgroundPositionTop) * (b - c.stellarRatio) + "px" : c.startingValueTop, m(c.$element, d, e)
            }
        },
        _handleScrollEvent: function () {
            var a = this,
                b = !1,
                c = function () {
                    a._repositionElements(), b = !1
                },
                d = function () {
                    b || (o(c), b = !0)
                };
            this.$scrollElement.bind("scroll." + this.name, d), d()
        },
        _startAnimationLoop: function () {
            var a = this;
            this._animationLoop = function () {
                o(a._animationLoop), a._repositionElements()
            }, this._animationLoop()
        }
    }, a.fn[f] = function (b) {
        var c = arguments;
        return b === d || "object" == typeof b ? this.each(function () {
            a.data(this, "plugin_" + f) || a.data(this, "plugin_" + f, new e(this, b))
        }) : "string" == typeof b && "_" !== b[0] && "init" !== b ? this.each(function () {
            var d = a.data(this, "plugin_" + f);
            d instanceof e && "function" == typeof d[b] && d[b].apply(d, Array.prototype.slice.call(c, 1)), "destroy" === b && a.data(this, "plugin_" + f, null)
        }) : void 0
    }, a[f] = function () {
        var c = a(b);
        return c.stellar.apply(c, Array.prototype.slice.call(arguments, 0))
    }, a[f].scrollProperty = h, a[f].positionProperty = i, b.Stellar = e
}(jQuery, this, document);

/*
 *  WOW animation
 * -----------------------------------------------
 */
/*! WOW - v1.1.2 - 2015-08-19
 * Copyright (c) 2015 Matthieu Aussaguel; Licensed MIT */
(function () {
    var a, b, c, d, e, f = function (a, b) {
            return function () {
                return a.apply(b, arguments)
            }
        },
        g = [].indexOf || function (a) {
            for (var b = 0, c = this.length; c > b; b++)
                if (b in this && this[b] === a) return b;
            return -1
        };
    b = function () {
        function a() {
        }

        return a.prototype.extend = function (a, b) {
            var c, d;
            for (c in b) d = b[c], null == a[c] && (a[c] = d);
            return a
        }, a.prototype.isMobile = function (a) {
            return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(a)
        }, a.prototype.createEvent = function (a, b, c, d) {
            var e;
            return null == b && (b = !1), null == c && (c = !1), null == d && (d = null), null != document.createEvent ? (e = document.createEvent("CustomEvent"), e.initCustomEvent(a, b, c, d)) : null != document.createEventObject ? (e = document.createEventObject(), e.eventType = a) : e.eventName = a, e
        }, a.prototype.emitEvent = function (a, b) {
            return null != a.dispatchEvent ? a.dispatchEvent(b) : b in (null != a) ? a[b]() : "on" + b in (null != a) ? a["on" + b]() : void 0
        }, a.prototype.addEvent = function (a, b, c) {
            return null != a.addEventListener ? a.addEventListener(b, c, !1) : null != a.attachEvent ? a.attachEvent("on" + b, c) : a[b] = c
        }, a.prototype.removeEvent = function (a, b, c) {
            return null != a.removeEventListener ? a.removeEventListener(b, c, !1) : null != a.detachEvent ? a.detachEvent("on" + b, c) : delete a[b]
        }, a.prototype.innerHeight = function () {
            return "innerHeight" in window ? window.innerHeight : document.documentElement.clientHeight
        }, a
    }(), c = this.WeakMap || this.MozWeakMap || (c = function () {
        function a() {
            this.keys = [], this.values = []
        }

        return a.prototype.get = function (a) {
            var b, c, d, e, f;
            for (f = this.keys, b = d = 0, e = f.length; e > d; b = ++d)
                if (c = f[b], c === a) return this.values[b]
        }, a.prototype.set = function (a, b) {
            var c, d, e, f, g;
            for (g = this.keys, c = e = 0, f = g.length; f > e; c = ++e)
                if (d = g[c], d === a) return void(this.values[c] = b);
            return this.keys.push(a), this.values.push(b)
        }, a
    }()), a = this.MutationObserver || this.WebkitMutationObserver || this.MozMutationObserver || (a = function () {
        function a() {
            "undefined" != typeof console && null !== console && console.warn("MutationObserver is not supported by your browser."), "undefined" != typeof console && null !== console && console.warn("WOW.js cannot detect dom mutations, please call .sync() after loading new content.")
        }

        return a.notSupported = !0, a.prototype.observe = function () {
        }, a
    }()), d = this.getComputedStyle || function (a) {
        return this.getPropertyValue = function (b) {
            var c;
            return "float" === b && (b = "styleFloat"), e.test(b) && b.replace(e, function (a, b) {
                return b.toUpperCase()
            }), (null != (c = a.currentStyle) ? c[b] : void 0) || null
        }, this
    }, e = /(\-([a-z]){1})/g, this.WOW = function () {
        function e(a) {
            null == a && (a = {}), this.scrollCallback = f(this.scrollCallback, this), this.scrollHandler = f(this.scrollHandler, this), this.resetAnimation = f(this.resetAnimation, this), this.start = f(this.start, this), this.scrolled = !0, this.config = this.util().extend(a, this.defaults), null != a.scrollContainer && (this.config.scrollContainer = document.querySelector(a.scrollContainer)), this.animationNameCache = new c, this.wowEvent = this.util().createEvent(this.config.boxClass)
        }

        return e.prototype.defaults = {
            boxClass: "wow",
            animateClass: "animated",
            offset: 0,
            mobile: !0,
            live: !0,
            callback: null,
            scrollContainer: null
        }, e.prototype.init = function () {
            var a;
            return this.element = window.document.documentElement, "interactive" === (a = document.readyState) || "complete" === a ? this.start() : this.util().addEvent(document, "DOMContentLoaded", this.start), this.finished = []
        }, e.prototype.start = function () {
            var b, c, d, e;
            if (this.stopped = !1, this.boxes = function () {
                    var a, c, d, e;
                    for (d = this.element.querySelectorAll("." + this.config.boxClass), e = [], a = 0, c = d.length; c > a; a++) b = d[a], e.push(b);
                    return e
                }.call(this), this.all = function () {
                    var a, c, d, e;
                    for (d = this.boxes, e = [], a = 0, c = d.length; c > a; a++) b = d[a], e.push(b);
                    return e
                }.call(this), this.boxes.length)
                if (this.disabled()) this.resetStyle();
                else
                    for (e = this.boxes, c = 0, d = e.length; d > c; c++) b = e[c], this.applyStyle(b, !0);
            return this.disabled() || (this.util().addEvent(this.config.scrollContainer || window, "scroll", this.scrollHandler), this.util().addEvent(window, "resize", this.scrollHandler), this.interval = setInterval(this.scrollCallback, 50)), this.config.live ? new a(function (a) {
                return function (b) {
                    var c, d, e, f, g;
                    for (g = [], c = 0, d = b.length; d > c; c++) f = b[c], g.push(function () {
                        var a, b, c, d;
                        for (c = f.addedNodes || [], d = [], a = 0, b = c.length; b > a; a++) e = c[a], d.push(this.doSync(e));
                        return d
                    }.call(a));
                    return g
                }
            }(this)).observe(document.body, {
                childList: !0,
                subtree: !0
            }) : void 0
        }, e.prototype.stop = function () {
            return this.stopped = !0, this.util().removeEvent(this.config.scrollContainer || window, "scroll", this.scrollHandler), this.util().removeEvent(window, "resize", this.scrollHandler), null != this.interval ? clearInterval(this.interval) : void 0
        }, e.prototype.sync = function () {
            return a.notSupported ? this.doSync(this.element) : void 0
        }, e.prototype.doSync = function (a) {
            var b, c, d, e, f;
            if (null == a && (a = this.element), 1 === a.nodeType) {
                for (a = a.parentNode || a, e = a.querySelectorAll("." + this.config.boxClass), f = [], c = 0, d = e.length; d > c; c++) b = e[c], g.call(this.all, b) < 0 ? (this.boxes.push(b), this.all.push(b), this.stopped || this.disabled() ? this.resetStyle() : this.applyStyle(b, !0), f.push(this.scrolled = !0)) : f.push(void 0);
                return f
            }
        }, e.prototype.show = function (a) {
            return this.applyStyle(a), a.className = a.className + " " + this.config.animateClass, null != this.config.callback && this.config.callback(a), this.util().emitEvent(a, this.wowEvent), this.util().addEvent(a, "animationend", this.resetAnimation), this.util().addEvent(a, "oanimationend", this.resetAnimation), this.util().addEvent(a, "webkitAnimationEnd", this.resetAnimation), this.util().addEvent(a, "MSAnimationEnd", this.resetAnimation), a
        }, e.prototype.applyStyle = function (a, b) {
            var c, d, e;
            return d = a.getAttribute("data-wow-duration"), c = a.getAttribute("data-wow-delay"), e = a.getAttribute("data-wow-iteration"), this.animate(function (f) {
                return function () {
                    return f.customStyle(a, b, d, c, e)
                }
            }(this))
        }, e.prototype.animate = function () {
            return "requestAnimationFrame" in window ? function (a) {
                return window.requestAnimationFrame(a)
            } : function (a) {
                return a()
            }
        }(), e.prototype.resetStyle = function () {
            var a, b, c, d, e;
            for (d = this.boxes, e = [], b = 0, c = d.length; c > b; b++) a = d[b], e.push(a.style.visibility = "visible");
            return e
        }, e.prototype.resetAnimation = function (a) {
            var b;
            return a.type.toLowerCase().indexOf("animationend") >= 0 ? (b = a.target || a.srcElement, b.className = b.className.replace(this.config.animateClass, "").trim()) : void 0
        }, e.prototype.customStyle = function (a, b, c, d, e) {
            return b && this.cacheAnimationName(a), a.style.visibility = b ? "hidden" : "visible", c && this.vendorSet(a.style, {
                animationDuration: c
            }), d && this.vendorSet(a.style, {
                animationDelay: d
            }), e && this.vendorSet(a.style, {
                animationIterationCount: e
            }), this.vendorSet(a.style, {
                animationName: b ? "none" : this.cachedAnimationName(a)
            }), a
        }, e.prototype.vendors = ["moz", "webkit"], e.prototype.vendorSet = function (a, b) {
            var c, d, e, f;
            d = [];
            for (c in b) e = b[c], a["" + c] = e, d.push(function () {
                var b, d, g, h;
                for (g = this.vendors, h = [], b = 0, d = g.length; d > b; b++) f = g[b], h.push(a["" + f + c.charAt(0).toUpperCase() + c.substr(1)] = e);
                return h
            }.call(this));
            return d
        }, e.prototype.vendorCSS = function (a, b) {
            var c, e, f, g, h, i;
            for (h = d(a), g = h.getPropertyCSSValue(b), f = this.vendors, c = 0, e = f.length; e > c; c++) i = f[c], g = g || h.getPropertyCSSValue("-" + i + "-" + b);
            return g
        }, e.prototype.animationName = function (a) {
            var b;
            try {
                b = this.vendorCSS(a, "animation-name").cssText
            } catch (c) {
                b = d(a).getPropertyValue("animation-name")
            }
            return "none" === b ? "" : b
        }, e.prototype.cacheAnimationName = function (a) {
            return this.animationNameCache.set(a, this.animationName(a))
        }, e.prototype.cachedAnimationName = function (a) {
            return this.animationNameCache.get(a)
        }, e.prototype.scrollHandler = function () {
            return this.scrolled = !0
        }, e.prototype.scrollCallback = function () {
            var a;
            return !this.scrolled || (this.scrolled = !1, this.boxes = function () {
                var b, c, d, e;
                for (d = this.boxes, e = [], b = 0, c = d.length; c > b; b++) a = d[b], a && (this.isVisible(a) ? this.show(a) : e.push(a));
                return e
            }.call(this), this.boxes.length || this.config.live) ? void 0 : this.stop()
        }, e.prototype.offsetTop = function (a) {
            for (var b; void 0 === a.offsetTop;) a = a.parentNode;
            for (b = a.offsetTop; a = a.offsetParent;) b += a.offsetTop;
            return b
        }, e.prototype.isVisible = function (a) {
            var b, c, d, e, f;
            return c = a.getAttribute("data-wow-offset") || this.config.offset, f = this.config.scrollContainer && this.config.scrollContainer.scrollTop || window.pageYOffset, e = f + Math.min(this.element.clientHeight, this.util().innerHeight()) - c, d = this.offsetTop(a), b = d + a.clientHeight, e >= d && b >= f
        }, e.prototype.util = function () {
            return null != this._util ? this._util : this._util = new b
        }, e.prototype.disabled = function () {
            return !this.config.mobile && this.util().isMobile(navigator.userAgent)
        }, e
    }()
}).call(this);

/*
 *  equalHeights
 * -----------------------------------------------
 */
$.fn.equalHeights = function (e) {
    return $(this).each(function () {
        var t = 0;
        $(this).children().each(function () {
            $(this).height() > t && (t = $(this).height())
        }), e && Number.prototype.pxToEm || (t = t.pxToEm()), $.browser.msie && 6 == $.browser.version && $(this).children().css({
            height: t
        }), $(this).children().css({
            "min-height": t
        })
    }), this
}, $.fn.equalWidths = function (e) {
    return $(this).each(function () {
        var t = 0;
        $(this).children().each(function () {
            $(this).width() > t && (t = $(this).width())
        }), e && Number.prototype.pxToEm || (t = t.pxToEm()), $.browser.msie && 6 == $.browser.version && $(this).children().css({
            width: t
        }), $(this).children().css({
            "min-width": t
        })
    }), this
}, Number.prototype.pxToEm = String.prototype.pxToEm = function (e) {
    e = jQuery.extend({
        scope: "body",
        reverse: !1
    }, e);
    var t, i = "" == this ? 0 : parseFloat(this),
        s = function () {
            var e = document.documentElement;
            return self.innerWidth || e && e.clientWidth || document.body.clientWidth
        };
    if ("body" == e.scope && $.browser.msie && (parseFloat($("body").css("font-size")) / s()).toFixed(1) > 0) {
        var r = function () {
            return 16 * (parseFloat($("body").css("font-size")) / s()).toFixed(3)
        };
        t = r()
    } else t = parseFloat(jQuery(e.scope).css("font-size"));
    var o = 1 == e.reverse ? (i * t).toFixed(2) + "px" : (i / t).toFixed(2) + "em";
    return o
};

/*
 *  Magnific Popup
 * -----------------------------------------------
 */
/*! Magnific Popup - v1.0.1 - 2015-12-30
 * http://dimsemenov.com/plugins/magnific-popup/
 * Copyright (c) 2015 Dmitry Semenov; */
!function (a) {
    "function" == typeof define && define.amd ? define(["jquery"], a) : a("object" == typeof exports ? require("jquery") : window.jQuery || window.Zepto)
}(function (a) {
    var b, c, d, e, f, g, h = "Close",
        i = "BeforeClose",
        j = "AfterClose",
        k = "BeforeAppend",
        l = "MarkupParse",
        m = "Open",
        n = "Change",
        o = "mfp",
        p = "." + o,
        q = "mfp-ready",
        r = "mfp-removing",
        s = "mfp-prevent-close",
        t = function () {
        },
        u = !!window.jQuery,
        v = a(window),
        w = function (a, c) {
            b.ev.on(o + a + p, c)
        },
        x = function (b, c, d, e) {
            var f = document.createElement("div");
            return f.className = "mfp-" + b, d && (f.innerHTML = d), e ? c && c.appendChild(f) : (f = a(f), c && f.appendTo(c)), f
        },
        y = function (c, d) {
            b.ev.triggerHandler(o + c, d), b.st.callbacks && (c = c.charAt(0).toLowerCase() + c.slice(1), b.st.callbacks[c] && b.st.callbacks[c].apply(b, a.isArray(d) ? d : [d]))
        },
        z = function (c) {
            return c === g && b.currTemplate.closeBtn || (b.currTemplate.closeBtn = a(b.st.closeMarkup.replace("%title%", b.st.tClose)), g = c), b.currTemplate.closeBtn
        },
        A = function () {
            a.magnificPopup.instance || (b = new t, b.init(), a.magnificPopup.instance = b)
        },
        B = function () {
            var a = document.createElement("p").style,
                b = ["ms", "O", "Moz", "Webkit"];
            if (void 0 !== a.transition) return !0;
            for (; b.length;)
                if (b.pop() + "Transition" in a) return !0;
            return !1
        };
    t.prototype = {
        constructor: t,
        init: function () {
            var c = navigator.appVersion;
            b.isIE7 = -1 !== c.indexOf("MSIE 7."), b.isIE8 = -1 !== c.indexOf("MSIE 8."), b.isLowIE = b.isIE7 || b.isIE8, b.isAndroid = /android/gi.test(c), b.isIOS = /iphone|ipad|ipod/gi.test(c), b.supportsTransition = B(), b.probablyMobile = b.isAndroid || b.isIOS || /(Opera Mini)|Kindle|webOS|BlackBerry|(Opera Mobi)|(Windows Phone)|IEMobile/i.test(navigator.userAgent), d = a(document), b.popupsCache = {}
        },
        open: function (c) {
            var e;
            if (c.isObj === !1) {
                b.items = c.items.toArray(), b.index = 0;
                var g, h = c.items;
                for (e = 0; e < h.length; e++)
                    if (g = h[e], g.parsed && (g = g.el[0]), g === c.el[0]) {
                        b.index = e;
                        break
                    }
            } else b.items = a.isArray(c.items) ? c.items : [c.items], b.index = c.index || 0;
            if (b.isOpen) return void b.updateItemHTML();
            b.types = [], f = "", c.mainEl && c.mainEl.length ? b.ev = c.mainEl.eq(0) : b.ev = d, c.key ? (b.popupsCache[c.key] || (b.popupsCache[c.key] = {}), b.currTemplate = b.popupsCache[c.key]) : b.currTemplate = {}, b.st = a.extend(!0, {}, a.magnificPopup.defaults, c), b.fixedContentPos = "auto" === b.st.fixedContentPos ? !b.probablyMobile : b.st.fixedContentPos, b.st.modal && (b.st.closeOnContentClick = !1, b.st.closeOnBgClick = !1, b.st.showCloseBtn = !1, b.st.enableEscapeKey = !1), b.bgOverlay || (b.bgOverlay = x("bg").on("click" + p, function () {
                b.close()
            }), b.wrap = x("wrap").attr("tabindex", -1).on("click" + p, function (a) {
                b._checkIfClose(a.target) && b.close()
            }), b.container = x("container", b.wrap)), b.contentContainer = x("content"), b.st.preloader && (b.preloader = x("preloader", b.container, b.st.tLoading));
            var i = a.magnificPopup.modules;
            for (e = 0; e < i.length; e++) {
                var j = i[e];
                j = j.charAt(0).toUpperCase() + j.slice(1), b["init" + j].call(b)
            }
            y("BeforeOpen"), b.st.showCloseBtn && (b.st.closeBtnInside ? (w(l, function (a, b, c, d) {
                c.close_replaceWith = z(d.type)
            }), f += " mfp-close-btn-in") : b.wrap.append(z())), b.st.alignTop && (f += " mfp-align-top"), b.fixedContentPos ? b.wrap.css({
                overflow: b.st.overflowY,
                overflowX: "hidden",
                overflowY: b.st.overflowY
            }) : b.wrap.css({
                top: v.scrollTop(),
                position: "absolute"
            }), (b.st.fixedBgPos === !1 || "auto" === b.st.fixedBgPos && !b.fixedContentPos) && b.bgOverlay.css({
                height: d.height(),
                position: "absolute"
            }), b.st.enableEscapeKey && d.on("keyup" + p, function (a) {
                27 === a.keyCode && b.close()
            }), v.on("resize" + p, function () {
                b.updateSize()
            }), b.st.closeOnContentClick || (f += " mfp-auto-cursor"), f && b.wrap.addClass(f);
            var k = b.wH = v.height(),
                n = {};
            if (b.fixedContentPos && b._hasScrollBar(k)) {
                var o = b._getScrollbarSize();
                o && (n.marginRight = o)
            }
            b.fixedContentPos && (b.isIE7 ? a("body, html").css("overflow", "hidden") : n.overflow = "hidden");
            var r = b.st.mainClass;
            return b.isIE7 && (r += " mfp-ie7"), r && b._addClassToMFP(r), b.updateItemHTML(), y("BuildControls"), a("html").css(n), b.bgOverlay.add(b.wrap).prependTo(b.st.prependTo || a(document.body)), b._lastFocusedEl = document.activeElement, setTimeout(function () {
                b.content ? (b._addClassToMFP(q), b._setFocus()) : b.bgOverlay.addClass(q), d.on("focusin" + p, b._onFocusIn)
            }, 16), b.isOpen = !0, b.updateSize(k), y(m), c
        },
        close: function () {
            b.isOpen && (y(i), b.isOpen = !1, b.st.removalDelay && !b.isLowIE && b.supportsTransition ? (b._addClassToMFP(r), setTimeout(function () {
                b._close()
            }, b.st.removalDelay)) : b._close())
        },
        _close: function () {
            y(h);
            var c = r + " " + q + " ";
            if (b.bgOverlay.detach(), b.wrap.detach(), b.container.empty(), b.st.mainClass && (c += b.st.mainClass + " "), b._removeClassFromMFP(c), b.fixedContentPos) {
                var e = {
                    marginRight: ""
                };
                b.isIE7 ? a("body, html").css("overflow", "") : e.overflow = "", a("html").css(e)
            }
            d.off("keyup" + p + " focusin" + p), b.ev.off(p), b.wrap.attr("class", "mfp-wrap").removeAttr("style"), b.bgOverlay.attr("class", "mfp-bg"), b.container.attr("class", "mfp-container"), !b.st.showCloseBtn || b.st.closeBtnInside && b.currTemplate[b.currItem.type] !== !0 || b.currTemplate.closeBtn && b.currTemplate.closeBtn.detach(), b.st.autoFocusLast && b._lastFocusedEl && a(b._lastFocusedEl).focus(), b.currItem = null, b.content = null, b.currTemplate = null, b.prevHeight = 0, y(j)
        },
        updateSize: function (a) {
            if (b.isIOS) {
                var c = document.documentElement.clientWidth / window.innerWidth,
                    d = window.innerHeight * c;
                b.wrap.css("height", d), b.wH = d
            } else b.wH = a || v.height();
            b.fixedContentPos || b.wrap.css("height", b.wH), y("Resize")
        },
        updateItemHTML: function () {
            var c = b.items[b.index];
            b.contentContainer.detach(), b.content && b.content.detach(), c.parsed || (c = b.parseEl(b.index));
            var d = c.type;
            if (y("BeforeChange", [b.currItem ? b.currItem.type : "", d]), b.currItem = c, !b.currTemplate[d]) {
                var f = b.st[d] ? b.st[d].markup : !1;
                y("FirstMarkupParse", f), f ? b.currTemplate[d] = a(f) : b.currTemplate[d] = !0
            }
            e && e !== c.type && b.container.removeClass("mfp-" + e + "-holder");
            var g = b["get" + d.charAt(0).toUpperCase() + d.slice(1)](c, b.currTemplate[d]);
            b.appendContent(g, d), c.preloaded = !0, y(n, c), e = c.type, b.container.prepend(b.contentContainer), y("AfterChange")
        },
        appendContent: function (a, c) {
            b.content = a, a ? b.st.showCloseBtn && b.st.closeBtnInside && b.currTemplate[c] === !0 ? b.content.find(".mfp-close").length || b.content.append(z()) : b.content = a : b.content = "", y(k), b.container.addClass("mfp-" + c + "-holder"), b.contentContainer.append(b.content)
        },
        parseEl: function (c) {
            var d, e = b.items[c];
            if (e.tagName ? e = {
                    el: a(e)
                } : (d = e.type, e = {
                    data: e,
                    src: e.src
                }), e.el) {
                for (var f = b.types, g = 0; g < f.length; g++)
                    if (e.el.hasClass("mfp-" + f[g])) {
                        d = f[g];
                        break
                    }
                e.src = e.el.attr("data-mfp-src"), e.src || (e.src = e.el.attr("href"))
            }
            return e.type = d || b.st.type || "inline", e.index = c, e.parsed = !0, b.items[c] = e, y("ElementParse", e), b.items[c]
        },
        addGroup: function (a, c) {
            var d = function (d) {
                d.mfpEl = this, b._openClick(d, a, c)
            };
            c || (c = {});
            var e = "click.magnificPopup";
            c.mainEl = a, c.items ? (c.isObj = !0, a.off(e).on(e, d)) : (c.isObj = !1, c.delegate ? a.off(e).on(e, c.delegate, d) : (c.items = a, a.off(e).on(e, d)))
        },
        _openClick: function (c, d, e) {
            var f = void 0 !== e.midClick ? e.midClick : a.magnificPopup.defaults.midClick;
            if (f || !(2 === c.which || c.ctrlKey || c.metaKey || c.altKey || c.shiftKey)) {
                var g = void 0 !== e.disableOn ? e.disableOn : a.magnificPopup.defaults.disableOn;
                if (g)
                    if (a.isFunction(g)) {
                        if (!g.call(b)) return !0
                    } else if (v.width() < g) return !0;
                c.type && (c.preventDefault(), b.isOpen && c.stopPropagation()), e.el = a(c.mfpEl), e.delegate && (e.items = d.find(e.delegate)), b.open(e)
            }
        },
        updateStatus: function (a, d) {
            if (b.preloader) {
                c !== a && b.container.removeClass("mfp-s-" + c), d || "loading" !== a || (d = b.st.tLoading);
                var e = {
                    status: a,
                    text: d
                };
                y("UpdateStatus", e), a = e.status, d = e.text, b.preloader.html(d), b.preloader.find("a").on("click", function (a) {
                    a.stopImmediatePropagation()
                }), b.container.addClass("mfp-s-" + a), c = a
            }
        },
        _checkIfClose: function (c) {
            if (!a(c).hasClass(s)) {
                var d = b.st.closeOnContentClick,
                    e = b.st.closeOnBgClick;
                if (d && e) return !0;
                if (!b.content || a(c).hasClass("mfp-close") || b.preloader && c === b.preloader[0]) return !0;
                if (c === b.content[0] || a.contains(b.content[0], c)) {
                    if (d) return !0
                } else if (e && a.contains(document, c)) return !0;
                return !1
            }
        },
        _addClassToMFP: function (a) {
            b.bgOverlay.addClass(a), b.wrap.addClass(a)
        },
        _removeClassFromMFP: function (a) {
            this.bgOverlay.removeClass(a), b.wrap.removeClass(a)
        },
        _hasScrollBar: function (a) {
            return (b.isIE7 ? d.height() : document.body.scrollHeight) > (a || v.height())
        },
        _setFocus: function () {
            (b.st.focus ? b.content.find(b.st.focus).eq(0) : b.wrap).focus()
        },
        _onFocusIn: function (c) {
            return c.target === b.wrap[0] || a.contains(b.wrap[0], c.target) ? void 0 : (b._setFocus(), !1)
        },
        _parseMarkup: function (b, c, d) {
            var e;
            d.data && (c = a.extend(d.data, c)), y(l, [b, c, d]), a.each(c, function (a, c) {
                if (void 0 === c || c === !1) return !0;
                if (e = a.split("_"), e.length > 1) {
                    var d = b.find(p + "-" + e[0]);
                    if (d.length > 0) {
                        var f = e[1];
                        "replaceWith" === f ? d[0] !== c[0] && d.replaceWith(c) : "img" === f ? d.is("img") ? d.attr("src", c) : d.replaceWith('<img src="' + c + '" class="' + d.attr("class") + '" />') : d.attr(e[1], c)
                    }
                } else b.find(p + "-" + a).html(c)
            })
        },
        _getScrollbarSize: function () {
            if (void 0 === b.scrollbarSize) {
                var a = document.createElement("div");
                a.style.cssText = "width: 99px; height: 99px; overflow: scroll; position: absolute; top: -9999px;", document.body.appendChild(a), b.scrollbarSize = a.offsetWidth - a.clientWidth, document.body.removeChild(a)
            }
            return b.scrollbarSize
        }
    }, a.magnificPopup = {
        instance: null,
        proto: t.prototype,
        modules: [],
        open: function (b, c) {
            return A(), b = b ? a.extend(!0, {}, b) : {}, b.isObj = !0, b.index = c || 0, this.instance.open(b)
        },
        close: function () {
            return a.magnificPopup.instance && a.magnificPopup.instance.close()
        },
        registerModule: function (b, c) {
            c.options && (a.magnificPopup.defaults[b] = c.options), a.extend(this.proto, c.proto), this.modules.push(b)
        },
        defaults: {
            disableOn: 0,
            key: null,
            midClick: !1,
            mainClass: "",
            preloader: !0,
            focus: "",
            closeOnContentClick: !1,
            closeOnBgClick: !0,
            closeBtnInside: !0,
            showCloseBtn: !0,
            enableEscapeKey: !0,
            modal: !1,
            alignTop: !1,
            removalDelay: 0,
            prependTo: null,
            fixedContentPos: "auto",
            fixedBgPos: "auto",
            overflowY: "auto",
            closeMarkup: '<button title="%title%" type="button" class="mfp-close">&#215;</button>',
            tClose: "Close (Esc)",
            tLoading: "Loading...",
            autoFocusLast: !0
        }
    }, a.fn.magnificPopup = function (c) {
        A();
        var d = a(this);
        if ("string" == typeof c)
            if ("open" === c) {
                var e, f = u ? d.data("magnificPopup") : d[0].magnificPopup,
                    g = parseInt(arguments[1], 10) || 0;
                f.items ? e = f.items[g] : (e = d, f.delegate && (e = e.find(f.delegate)), e = e.eq(g)), b._openClick({
                    mfpEl: e
                }, d, f)
            } else b.isOpen && b[c].apply(b, Array.prototype.slice.call(arguments, 1));
        else c = a.extend(!0, {}, c), u ? d.data("magnificPopup", c) : d[0].magnificPopup = c, b.addGroup(d, c);
        return d
    };
    var C, D, E, F = "inline",
        G = function () {
            E && (D.after(E.addClass(C)).detach(), E = null)
        };
    a.magnificPopup.registerModule(F, {
        options: {
            hiddenClass: "hide",
            markup: "",
            tNotFound: "Content not found"
        },
        proto: {
            initInline: function () {
                b.types.push(F), w(h + "." + F, function () {
                    G()
                })
            },
            getInline: function (c, d) {
                if (G(), c.src) {
                    var e = b.st.inline,
                        f = a(c.src);
                    if (f.length) {
                        var g = f[0].parentNode;
                        g && g.tagName && (D || (C = e.hiddenClass, D = x(C), C = "mfp-" + C), E = f.after(D).detach().removeClass(C)), b.updateStatus("ready")
                    } else b.updateStatus("error", e.tNotFound), f = a("<div>");
                    return c.inlineElement = f, f
                }
                return b.updateStatus("ready"), b._parseMarkup(d, {}, c), d
            }
        }
    });
    var H, I = "ajax",
        J = function () {
            H && a(document.body).removeClass(H)
        },
        K = function () {
            J(), b.req && b.req.abort()
        };
    a.magnificPopup.registerModule(I, {
        options: {
            settings: null,
            cursor: "mfp-ajax-cur",
            tError: '<a href="%url%">The content</a> could not be loaded.'
        },
        proto: {
            initAjax: function () {
                b.types.push(I), H = b.st.ajax.cursor, w(h + "." + I, K), w("BeforeChange." + I, K)
            },
            getAjax: function (c) {
                H && a(document.body).addClass(H), b.updateStatus("loading");
                var d = a.extend({
                    url: c.src,
                    success: function (d, e, f) {
                        var g = {
                            data: d,
                            xhr: f
                        };
                        y("ParseAjax", g), b.appendContent(a(g.data), I), c.finished = !0, J(), b._setFocus(), setTimeout(function () {
                            b.wrap.addClass(q)
                        }, 16), b.updateStatus("ready"), y("AjaxContentAdded")
                    },
                    error: function () {
                        J(), c.finished = c.loadError = !0, b.updateStatus("error", b.st.ajax.tError.replace("%url%", c.src))
                    }
                }, b.st.ajax.settings);
                return b.req = a.ajax(d), ""
            }
        }
    });
    var L, M = function (c) {
        if (c.data && void 0 !== c.data.title) return c.data.title;
        var d = b.st.image.titleSrc;
        if (d) {
            if (a.isFunction(d)) return d.call(b, c);
            if (c.el) return c.el.attr(d) || ""
        }
        return ""
    };
    a.magnificPopup.registerModule("image", {
        options: {
            markup: '<div class="mfp-figure"><div class="mfp-close"></div><figure><div class="mfp-img"></div><figcaption><div class="mfp-bottom-bar"><div class="mfp-title"></div><div class="mfp-counter"></div></div></figcaption></figure></div>',
            cursor: "mfp-zoom-out-cur",
            titleSrc: "title",
            verticalFit: !0,
            tError: '<a href="%url%">The image</a> could not be loaded.'
        },
        proto: {
            initImage: function () {
                var c = b.st.image,
                    d = ".image";
                b.types.push("image"), w(m + d, function () {
                    "image" === b.currItem.type && c.cursor && a(document.body).addClass(c.cursor)
                }), w(h + d, function () {
                    c.cursor && a(document.body).removeClass(c.cursor), v.off("resize" + p)
                }), w("Resize" + d, b.resizeImage), b.isLowIE && w("AfterChange", b.resizeImage)
            },
            resizeImage: function () {
                var a = b.currItem;
                if (a && a.img && b.st.image.verticalFit) {
                    var c = 0;
                    b.isLowIE && (c = parseInt(a.img.css("padding-top"), 10) + parseInt(a.img.css("padding-bottom"), 10)), a.img.css("max-height", b.wH - c)
                }
            },
            _onImageHasSize: function (a) {
                a.img && (a.hasSize = !0, L && clearInterval(L), a.isCheckingImgSize = !1, y("ImageHasSize", a), a.imgHidden && (b.content && b.content.removeClass("mfp-loading"), a.imgHidden = !1))
            },
            findImageSize: function (a) {
                var c = 0,
                    d = a.img[0],
                    e = function (f) {
                        L && clearInterval(L), L = setInterval(function () {
                            return d.naturalWidth > 0 ? void b._onImageHasSize(a) : (c > 200 && clearInterval(L), c++, void(3 === c ? e(10) : 40 === c ? e(50) : 100 === c && e(500)))
                        }, f)
                    };
                e(1)
            },
            getImage: function (c, d) {
                var e = 0,
                    f = function () {
                        c && (c.img[0].complete ? (c.img.off(".mfploader"), c === b.currItem && (b._onImageHasSize(c), b.updateStatus("ready")), c.hasSize = !0, c.loaded = !0, y("ImageLoadComplete")) : (e++, 200 > e ? setTimeout(f, 100) : g()))
                    },
                    g = function () {
                        c && (c.img.off(".mfploader"), c === b.currItem && (b._onImageHasSize(c), b.updateStatus("error", h.tError.replace("%url%", c.src))), c.hasSize = !0, c.loaded = !0, c.loadError = !0)
                    },
                    h = b.st.image,
                    i = d.find(".mfp-img");
                if (i.length) {
                    var j = document.createElement("img");
                    j.className = "mfp-img", c.el && c.el.find("img").length && (j.alt = c.el.find("img").attr("alt")), c.img = a(j).on("load.mfploader", f).on("error.mfploader", g), j.src = c.src, i.is("img") && (c.img = c.img.clone()), j = c.img[0], j.naturalWidth > 0 ? c.hasSize = !0 : j.width || (c.hasSize = !1)
                }
                return b._parseMarkup(d, {
                    title: M(c),
                    img_replaceWith: c.img
                }, c), b.resizeImage(), c.hasSize ? (L && clearInterval(L), c.loadError ? (d.addClass("mfp-loading"), b.updateStatus("error", h.tError.replace("%url%", c.src))) : (d.removeClass("mfp-loading"), b.updateStatus("ready")), d) : (b.updateStatus("loading"), c.loading = !0, c.hasSize || (c.imgHidden = !0, d.addClass("mfp-loading"), b.findImageSize(c)), d)
            }
        }
    });
    var N, O = function () {
        return void 0 === N && (N = void 0 !== document.createElement("p").style.MozTransform), N
    };
    a.magnificPopup.registerModule("zoom", {
        options: {
            enabled: !1,
            easing: "ease-in-out",
            duration: 300,
            opener: function (a) {
                return a.is("img") ? a : a.find("img")
            }
        },
        proto: {
            initZoom: function () {
                var a, c = b.st.zoom,
                    d = ".zoom";
                if (c.enabled && b.supportsTransition) {
                    var e, f, g = c.duration,
                        j = function (a) {
                            var b = a.clone().removeAttr("style").removeAttr("class").addClass("mfp-animated-image"),
                                d = "all " + c.duration / 1e3 + "s " + c.easing,
                                e = {
                                    position: "fixed",
                                    zIndex: 9999,
                                    left: 0,
                                    top: 0,
                                    "-webkit-backface-visibility": "hidden"
                                },
                                f = "transition";
                            return e["-webkit-" + f] = e["-moz-" + f] = e["-o-" + f] = e[f] = d, b.css(e), b
                        },
                        k = function () {
                            b.content.css("visibility", "visible")
                        };
                    w("BuildControls" + d, function () {
                        if (b._allowZoom()) {
                            if (clearTimeout(e), b.content.css("visibility", "hidden"), a = b._getItemToZoom(), !a) return void k();
                            f = j(a), f.css(b._getOffset()), b.wrap.append(f), e = setTimeout(function () {
                                f.css(b._getOffset(!0)), e = setTimeout(function () {
                                    k(), setTimeout(function () {
                                        f.remove(), a = f = null, y("ZoomAnimationEnded")
                                    }, 16)
                                }, g)
                            }, 16)
                        }
                    }), w(i + d, function () {
                        if (b._allowZoom()) {
                            if (clearTimeout(e), b.st.removalDelay = g, !a) {
                                if (a = b._getItemToZoom(), !a) return;
                                f = j(a)
                            }
                            f.css(b._getOffset(!0)), b.wrap.append(f), b.content.css("visibility", "hidden"), setTimeout(function () {
                                f.css(b._getOffset())
                            }, 16)
                        }
                    }), w(h + d, function () {
                        b._allowZoom() && (k(), f && f.remove(), a = null)
                    })
                }
            },
            _allowZoom: function () {
                return "image" === b.currItem.type
            },
            _getItemToZoom: function () {
                return b.currItem.hasSize ? b.currItem.img : !1
            },
            _getOffset: function (c) {
                var d;
                d = c ? b.currItem.img : b.st.zoom.opener(b.currItem.el || b.currItem);
                var e = d.offset(),
                    f = parseInt(d.css("padding-top"), 10),
                    g = parseInt(d.css("padding-bottom"), 10);
                e.top -= a(window).scrollTop() - f;
                var h = {
                    width: d.width(),
                    height: (u ? d.innerHeight() : d[0].offsetHeight) - g - f
                };
                return O() ? h["-moz-transform"] = h.transform = "translate(" + e.left + "px," + e.top + "px)" : (h.left = e.left, h.top = e.top), h
            }
        }
    });
    var P = "iframe",
        Q = "//about:blank",
        R = function (a) {
            if (b.currTemplate[P]) {
                var c = b.currTemplate[P].find("iframe");
                c.length && (a || (c[0].src = Q), b.isIE8 && c.css("display", a ? "block" : "none"))
            }
        };
    a.magnificPopup.registerModule(P, {
        options: {
            markup: '<div class="mfp-iframe-scaler"><div class="mfp-close"></div><iframe class="mfp-iframe" src="//about:blank" allowfullscreen></iframe></div>',
            srcAction: "iframe_src",
            patterns: {
                youtube: {
                    index: "youtube.com",
                    id: "v=",
                    src: "//www.youtube.com/embed/%id%?autoplay=1"
                },
                vimeo: {
                    index: "vimeo.com/",
                    id: "/",
                    src: "//player.vimeo.com/video/%id%?autoplay=1"
                },
                gmaps: {
                    index: "//maps.google.",
                    src: "%id%&output=embed"
                }
            }
        },
        proto: {
            initIframe: function () {
                b.types.push(P), w("BeforeChange", function (a, b, c) {
                    b !== c && (b === P ? R() : c === P && R(!0))
                }), w(h + "." + P, function () {
                    R()
                })
            },
            getIframe: function (c, d) {
                var e = c.src,
                    f = b.st.iframe;
                a.each(f.patterns, function () {
                    return e.indexOf(this.index) > -1 ? (this.id && (e = "string" == typeof this.id ? e.substr(e.lastIndexOf(this.id) + this.id.length, e.length) : this.id.call(this, e)), e = this.src.replace("%id%", e), !1) : void 0
                });
                var g = {};
                return f.srcAction && (g[f.srcAction] = e), b._parseMarkup(d, g, c), b.updateStatus("ready"), d
            }
        }
    });
    var S = function (a) {
            var c = b.items.length;
            return a > c - 1 ? a - c : 0 > a ? c + a : a
        },
        T = function (a, b, c) {
            return a.replace(/%curr%/gi, b + 1).replace(/%total%/gi, c)
        };
    a.magnificPopup.registerModule("gallery", {
        options: {
            enabled: !1,
            arrowMarkup: '<button title="%title%" type="button" class="mfp-arrow mfp-arrow-%dir%"></button>',
            preload: [0, 2],
            navigateByImgClick: !0,
            arrows: !0,
            tPrev: "Previous (Left arrow key)",
            tNext: "Next (Right arrow key)",
            tCounter: "%curr% of %total%"
        },
        proto: {
            initGallery: function () {
                var c = b.st.gallery,
                    e = ".mfp-gallery",
                    g = Boolean(a.fn.mfpFastClick);
                return b.direction = !0, c && c.enabled ? (f += " mfp-gallery", w(m + e, function () {
                    c.navigateByImgClick && b.wrap.on("click" + e, ".mfp-img", function () {
                        return b.items.length > 1 ? (b.next(), !1) : void 0
                    }), d.on("keydown" + e, function (a) {
                        37 === a.keyCode ? b.prev() : 39 === a.keyCode && b.next()
                    })
                }), w("UpdateStatus" + e, function (a, c) {
                    c.text && (c.text = T(c.text, b.currItem.index, b.items.length))
                }), w(l + e, function (a, d, e, f) {
                    var g = b.items.length;
                    e.counter = g > 1 ? T(c.tCounter, f.index, g) : ""
                }), w("BuildControls" + e, function () {
                    if (b.items.length > 1 && c.arrows && !b.arrowLeft) {
                        var d = c.arrowMarkup,
                            e = b.arrowLeft = a(d.replace(/%title%/gi, c.tPrev).replace(/%dir%/gi, "left")).addClass(s),
                            f = b.arrowRight = a(d.replace(/%title%/gi, c.tNext).replace(/%dir%/gi, "right")).addClass(s),
                            h = g ? "mfpFastClick" : "click";
                        e[h](function () {
                            b.prev()
                        }), f[h](function () {
                            b.next()
                        }), b.isIE7 && (x("b", e[0], !1, !0), x("a", e[0], !1, !0), x("b", f[0], !1, !0), x("a", f[0], !1, !0)), b.container.append(e.add(f))
                    }
                }), w(n + e, function () {
                    b._preloadTimeout && clearTimeout(b._preloadTimeout), b._preloadTimeout = setTimeout(function () {
                        b.preloadNearbyImages(), b._preloadTimeout = null
                    }, 16)
                }), void w(h + e, function () {
                    d.off(e), b.wrap.off("click" + e), b.arrowLeft && g && b.arrowLeft.add(b.arrowRight).destroyMfpFastClick(), b.arrowRight = b.arrowLeft = null
                })) : !1
            },
            next: function () {
                b.direction = !0, b.index = S(b.index + 1), b.updateItemHTML()
            },
            prev: function () {
                b.direction = !1, b.index = S(b.index - 1), b.updateItemHTML()
            },
            goTo: function (a) {
                b.direction = a >= b.index, b.index = a, b.updateItemHTML()
            },
            preloadNearbyImages: function () {
                var a, c = b.st.gallery.preload,
                    d = Math.min(c[0], b.items.length),
                    e = Math.min(c[1], b.items.length);
                for (a = 1; a <= (b.direction ? e : d); a++) b._preloadItem(b.index + a);
                for (a = 1; a <= (b.direction ? d : e); a++) b._preloadItem(b.index - a)
            },
            _preloadItem: function (c) {
                if (c = S(c), !b.items[c].preloaded) {
                    var d = b.items[c];
                    d.parsed || (d = b.parseEl(c)), y("LazyLoad", d), "image" === d.type && (d.img = a('<img class="mfp-img" />').on("load.mfploader", function () {
                        d.hasSize = !0
                    }).on("error.mfploader", function () {
                        d.hasSize = !0, d.loadError = !0, y("LazyLoadError", d)
                    }).attr("src", d.src)), d.preloaded = !0
                }
            }
        }
    });
    var U = "retina";
    a.magnificPopup.registerModule(U, {
        options: {
            replaceSrc: function (a) {
                return a.src.replace(/\.\w+$/, function (a) {
                    return "@2x" + a
                })
            },
            ratio: 1
        },
        proto: {
            initRetina: function () {
                if (window.devicePixelRatio > 1) {
                    var a = b.st.retina,
                        c = a.ratio;
                    c = isNaN(c) ? c() : c, c > 1 && (w("ImageHasSize." + U, function (a, b) {
                        b.img.css({
                            "max-width": b.img[0].naturalWidth / c,
                            width: "100%"
                        })
                    }), w("ElementParse." + U, function (b, d) {
                        d.src = a.replaceSrc(d, c)
                    }))
                }
            }
        }
    }),
        function () {
            var b = 1e3,
                c = "ontouchstart" in window,
                d = function () {
                    v.off("touchmove" + f + " touchend" + f)
                },
                e = "mfpFastClick",
                f = "." + e;
            a.fn.mfpFastClick = function (e) {
                return a(this).each(function () {
                    var g, h = a(this);
                    if (c) {
                        var i, j, k, l, m, n;
                        h.on("touchstart" + f, function (a) {
                            l = !1, n = 1, m = a.originalEvent ? a.originalEvent.touches[0] : a.touches[0], j = m.clientX, k = m.clientY, v.on("touchmove" + f, function (a) {
                                m = a.originalEvent ? a.originalEvent.touches : a.touches, n = m.length, m = m[0], (Math.abs(m.clientX - j) > 10 || Math.abs(m.clientY - k) > 10) && (l = !0, d())
                            }).on("touchend" + f, function (a) {
                                d(), l || n > 1 || (g = !0, a.preventDefault(), clearTimeout(i), i = setTimeout(function () {
                                    g = !1
                                }, b), e())
                            })
                        })
                    }
                    h.on("click" + f, function () {
                        g || e()
                    })
                })
            }, a.fn.destroyMfpFastClick = function () {
                a(this).off("touchstart" + f + " click" + f), c && v.off("touchmove" + f + " touchend" + f)
            }
        }(), A()
});

/*
 *  Nivo Lightbox
 * -----------------------------------------------
 */
/*
 * Nivo Lightbox v1.2.0
 * http://dev7studios.com/nivo-lightbox
 *
 * Copyright 2013, Dev7studios
 * Free to use and abuse under the MIT license.
 * http://www.opensource.org/licenses/mit-license.php
 */
(function (e, t, n, r) {
    function o(t, n) {
        this.el = t;
        this.$el = e(this.el);
        this.options = e.extend({}, s, n);
        this._defaults = s;
        this._name = i;
        this.init()
    }

    var i = "nivoLightbox",
        s = {
            effect: "fade",
            theme: "default",
            keyboardNav: true,
            clickOverlayToClose: true,
            onInit: function () {
            },
            beforeShowLightbox: function () {
            },
            afterShowLightbox: function (e) {
            },
            beforeHideLightbox: function () {
            },
            afterHideLightbox: function () {
            },
            onPrev: function (e) {
            },
            onNext: function (e) {
            },
            errorMessage: "The requested content cannot be loaded. Please try again later."
        };
    o.prototype = {
        init: function () {
            var t = this;
            if (!e("html").hasClass("nivo-lightbox-notouch")) e("html").addClass("nivo-lightbox-notouch");
            if ("ontouchstart" in n) e("html").removeClass("nivo-lightbox-notouch");
            this.$el.on("click", function (e) {
                t.showLightbox(e)
            });
            if (this.options.keyboardNav) {
                e("body").off("keyup").on("keyup", function (n) {
                    var r = n.keyCode ? n.keyCode : n.which;
                    if (r == 27) t.destructLightbox();
                    if (r == 37) e(".nivo-lightbox-prev").trigger("click");
                    if (r == 39) e(".nivo-lightbox-next").trigger("click")
                })
            }
            this.options.onInit.call(this)
        },
        showLightbox: function (t) {
            var n = this,
                r = this.$el;
            var i = this.checkContent(r);
            if (!i) return;
            t.preventDefault();
            this.options.beforeShowLightbox.call(this);
            var s = this.constructLightbox();
            if (!s) return;
            var o = s.find(".nivo-lightbox-content");
            if (!o) return;
            e("body").addClass("nivo-lightbox-body-effect-" + this.options.effect);
            this.processContent(o, r);
            if (this.$el.attr("data-lightbox-gallery")) {
                var u = e('[data-lightbox-gallery="' + this.$el.attr("data-lightbox-gallery") + '"]');
                e(".nivo-lightbox-nav").show();
                e(".nivo-lightbox-prev").off("click").on("click", function (t) {
                    t.preventDefault();
                    var i = u.index(r);
                    r = u.eq(i - 1);
                    if (!e(r).length) r = u.last();
                    n.processContent(o, r);
                    n.options.onPrev.call(this, [r])
                });
                e(".nivo-lightbox-next").off("click").on("click", function (t) {
                    t.preventDefault();
                    var i = u.index(r);
                    r = u.eq(i + 1);
                    if (!e(r).length) r = u.first();
                    n.processContent(o, r);
                    n.options.onNext.call(this, [r])
                })
            }
            setTimeout(function () {
                s.addClass("nivo-lightbox-open");
                n.options.afterShowLightbox.call(this, [s])
            }, 1)
        },
        checkContent: function (e) {
            var t = this,
                n = e.attr("href"),
                r = n.match(/(youtube|youtu|vimeo)\.(com|be)\/(watch\?v=([\w-]+)|([\w-]+))/);
            if (n.match(/\.(jpeg|jpg|gif|png)$/i) !== null) {
                return true
            } else if (r) {
                return true
            } else if (e.attr("data-lightbox-type") == "ajax") {
                return true
            } else if (n.substring(0, 1) == "#" && e.attr("data-lightbox-type") == "inline") {
                return true
            } else if (e.attr("data-lightbox-type") == "iframe") {
                return true
            }
            return false
        },
        processContent: function (n, r) {
            var i = this,
                s = r.attr("href"),
                o = s.match(/(youtube|youtu|vimeo)\.(com|be)\/(watch\?v=([\w-]+)|([\w-]+))/);
            n.html("").addClass("nivo-lightbox-loading");
            if (this.isHidpi() && r.attr("data-lightbox-hidpi")) {
                s = r.attr("data-lightbox-hidpi")
            }
            if (s.match(/\.(jpeg|jpg|gif|png)$/i) !== null) {
                var u = e("<img>", {
                    src: s
                });
                u.one("load", function () {
                    var r = e('<div class="nivo-lightbox-image" />');
                    r.append(u);
                    n.html(r).removeClass("nivo-lightbox-loading");
                    r.css({
                        "line-height": e(".nivo-lightbox-content").height() + "px",
                        height: e(".nivo-lightbox-content").height() + "px"
                    });
                    e(t).resize(function () {
                        r.css({
                            "line-height": e(".nivo-lightbox-content").height() + "px",
                            height: e(".nivo-lightbox-content").height() + "px"
                        })
                    })
                }).each(function () {
                    if (this.complete) e(this).load()
                });
                u.error(function () {
                    var t = e('<div class="nivo-lightbox-error"><p>' + i.options.errorMessage + "</p></div>");
                    n.html(t).removeClass("nivo-lightbox-loading")
                })
            } else if (o) {
                var a = "",
                    f = "nivo-lightbox-video";
                if (o[1] == "youtube") {
                    a = "http://www.youtube.com/embed/" + o[4];
                    f = "nivo-lightbox-youtube"
                }
                if (o[1] == "youtu") {
                    a = "http://www.youtube.com/embed/" + o[3];
                    f = "nivo-lightbox-youtube"
                }
                if (o[1] == "vimeo") {
                    a = "http://player.vimeo.com/video/" + o[3];
                    f = "nivo-lightbox-vimeo"
                }
                if (a) {
                    var l = e("<iframe>", {
                        src: a,
                        "class": f,
                        frameborder: 0,
                        vspace: 0,
                        hspace: 0,
                        scrolling: "auto"
                    });
                    n.html(l);
                    l.load(function () {
                        n.removeClass("nivo-lightbox-loading")
                    })
                }
            } else if (r.attr("data-lightbox-type") == "ajax") {
                e.ajax({
                    url: s,
                    cache: false,
                    success: function (r) {
                        var i = e('<div class="nivo-lightbox-ajax" />');
                        i.append(r);
                        n.html(i).removeClass("nivo-lightbox-loading");
                        if (i.outerHeight() < n.height()) {
                            i.css({
                                position: "relative",
                                top: "50%",
                                "margin-top": -(i.outerHeight() / 2) + "px"
                            })
                        }
                        e(t).resize(function () {
                            if (i.outerHeight() < n.height()) {
                                i.css({
                                    position: "relative",
                                    top: "50%",
                                    "margin-top": -(i.outerHeight() / 2) + "px"
                                })
                            }
                        })
                    },
                    error: function () {
                        var t = e('<div class="nivo-lightbox-error"><p>' + i.options.errorMessage + "</p></div>");
                        n.html(t).removeClass("nivo-lightbox-loading")
                    }
                })
            } else if (s.substring(0, 1) == "#" && r.attr("data-lightbox-type") == "inline") {
                if (e(s).length) {
                    var c = e('<div class="nivo-lightbox-inline" />');
                    c.append(e(s).clone().show());
                    n.html(c).removeClass("nivo-lightbox-loading");
                    if (c.outerHeight() < n.height()) {
                        c.css({
                            position: "relative",
                            top: "50%",
                            "margin-top": -(c.outerHeight() / 2) + "px"
                        })
                    }
                    e(t).resize(function () {
                        if (c.outerHeight() < n.height()) {
                            c.css({
                                position: "relative",
                                top: "50%",
                                "margin-top": -(c.outerHeight() / 2) + "px"
                            })
                        }
                    })
                } else {
                    var h = e('<div class="nivo-lightbox-error"><p>' + i.options.errorMessage + "</p></div>");
                    n.html(h).removeClass("nivo-lightbox-loading")
                }
            } else if (r.attr("data-lightbox-type") == "iframe") {
                var p = e("<iframe>", {
                    src: s,
                    "class": "nivo-lightbox-item",
                    frameborder: 0,
                    vspace: 0,
                    hspace: 0,
                    scrolling: "auto"
                });
                n.html(p);
                p.load(function () {
                    n.removeClass("nivo-lightbox-loading")
                })
            } else {
                return false
            }
            if (r.attr("title")) {
                var d = e("<span>", {
                    "class": "nivo-lightbox-title"
                });
                d.text(r.attr("title"));
                e(".nivo-lightbox-title-wrap").html(d)
            } else {
                e(".nivo-lightbox-title-wrap").html("")
            }
        },
        constructLightbox: function () {
            if (e(".nivo-lightbox-overlay").length) return e(".nivo-lightbox-overlay");
            var t = e("<div>", {
                "class": "nivo-lightbox-overlay nivo-lightbox-theme-" + this.options.theme + " nivo-lightbox-effect-" + this.options.effect
            });
            var n = e("<div>", {
                "class": "nivo-lightbox-wrap"
            });
            var r = e("<div>", {
                "class": "nivo-lightbox-content"
            });
            var i = e('<a href="#" class="nivo-lightbox-nav nivo-lightbox-prev">Previous</a><a href="#" class="nivo-lightbox-nav nivo-lightbox-next">Next</a>');
            var s = e('<a href="#" class="nivo-lightbox-close" title="Close">Close</a>');
            var o = e("<div>", {
                "class": "nivo-lightbox-title-wrap"
            });
            var u = 0;
            if (u) t.addClass("nivo-lightbox-ie");
            n.append(r);
            n.append(o);
            t.append(n);
            t.append(i);
            t.append(s);
            e("body").append(t);
            var a = this;
            if (a.options.clickOverlayToClose) {
                t.on("click", function (t) {
                    if (t.target === this || e(t.target).hasClass("nivo-lightbox-content") || e(t.target).hasClass("nivo-lightbox-image")) {
                        a.destructLightbox()
                    }
                })
            }
            s.on("click", function (e) {
                e.preventDefault();
                a.destructLightbox()
            });
            return t
        },
        destructLightbox: function () {
            var t = this;
            this.options.beforeHideLightbox.call(this);
            e(".nivo-lightbox-overlay").removeClass("nivo-lightbox-open");
            e(".nivo-lightbox-nav").hide();
            e("body").removeClass("nivo-lightbox-body-effect-" + t.options.effect);
            var n = 0;
            if (n) {
                e(".nivo-lightbox-overlay iframe").attr("src", " ");
                e(".nivo-lightbox-overlay iframe").remove()
            }
            e(".nivo-lightbox-prev").off("click");
            e(".nivo-lightbox-next").off("click");
            e(".nivo-lightbox-content").empty();
            this.options.afterHideLightbox.call(this)
        },
        isHidpi: function () {
            var e = "(-webkit-min-device-pixel-ratio: 1.5),                              (min--moz-device-pixel-ratio: 1.5),                              (-o-min-device-pixel-ratio: 3/2),                              (min-resolution: 1.5dppx)";
            if (t.devicePixelRatio > 1) return true;
            if (t.matchMedia && t.matchMedia(e).matches) return true;
            return false
        }
    };
    e.fn[i] = function (t) {
        return this.each(function () {
            if (!e.data(this, i)) {
                e.data(this, i, new o(this, t))
            }
        })
    }
})(jQuery, window, document);
/*
 *  YTPlayer
 * -----------------------------------------------
 */
/*___________________________________________________________________________________________________________________________________________________
_ jquery.mb.components                                                                                                                             _
_                                                                                                                                                  _
_ file: jquery.mb.YTPlayer.src.js                                                                                                                  _
_ last modified: 24/10/16 22.30                                                                                                                    _
_                                                                                                                                                  _
_ Open Lab s.r.l., Florence - Italy                                                                                                                _
_                                                                                                                                                  _
_ email: matteo@open-lab.com                                                                                                                       _
_ site: http://pupunzi.com                                                                                                                         _
_       http://open-lab.com                                                                                                                        _
_ blog: http://pupunzi.open-lab.com                                                                                                                _
_ Q&A:  http://jquery.pupunzi.com                                                                                                                  _
_                                                                                                                                                  _
_ Licences: MIT, GPL                                                                                                                               _
_    http://www.opensource.org/licenses/mit-license.php                                                                                            _
_    http://www.gnu.org/licenses/gpl.html                                                                                                          _
_                                                                                                                                                  _
_ Copyright (c) 2001-2016. Matteo Bicocchi (Pupunzi);                                                                                              _
___________________________________________________________________________________________________________________________________________________*/
var ytp = ytp || {};

function onYouTubeIframeAPIReady() {
    if (ytp.YTAPIReady) return;
    ytp.YTAPIReady = true;
    jQuery(document).trigger("YTAPIReady");
}

//window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

var getYTPVideoID = function (url) {
    var videoID, playlistID;
    if (url.indexOf("youtu.be") > 0) {
        videoID = url.substr(url.lastIndexOf("/") + 1, url.length);
        playlistID = videoID.indexOf("?list=") > 0 ? videoID.substr(videoID.lastIndexOf("="), videoID.length) : null;
        videoID = playlistID ? videoID.substr(0, videoID.lastIndexOf("?")) : videoID;
    } else if (url.indexOf("http") > -1) {
        //videoID = url.match( /([\/&]v\/([^&#]*))|([\\?&]v=([^&#]*))/ )[ 1 ];
        videoID = url.match(/[\\?&]v=([^&#]*)/)[1];
        playlistID = url.indexOf("list=") > 0 ? url.match(/[\\?&]list=([^&#]*)/)[1] : null;
    } else {
        videoID = url.length > 15 ? null : url;
        playlistID = videoID ? null : url;
    }
    return {
        videoID: videoID,
        playlistID: playlistID
    };
};

(function (jQuery, ytp) {

    jQuery.mbYTPlayer = {
        name: "jquery.mb.YTPlayer",
        version: "3.0.19",
        build: "6248",
        author: "Matteo Bicocchi (pupunzi)",
        apiKey: "",
        defaults: {
            containment: "body",
            ratio: "auto", // "auto", "16/9", "4/3" or number: 4/3, 16/9
            videoURL: null,
            playlistURL: null,
            startAt: 0,
            stopAt: 0,
            autoPlay: true,
            vol: 50, // 1 to 100
            addRaster: false,
            mask: false,
            opacity: 1,
            quality: "default", //or “small”, “medium”, “large”, “hd720”, “hd1080”, “highres”
            mute: false,
            loop: true,
            fadeOnStartTime: 500, //fade in timing at video start
            showControls: true,
            showAnnotations: false,
            showYTLogo: true,
            stopMovieOnBlur: true,
            realfullscreen: true,
            mobileFallbackImage: null,
            gaTrack: true,
            optimizeDisplay: true,
            remember_last_time: false,
            anchor: "center,center", // top,bottom,left,right combined in pair
            onReady: function (player) {
            },
            onError: function (player, err) {
            }
        },
        /**
         *  @fontface icons
         *  */
        controls: {
            play: "P",
            pause: "p",
            mute: "M",
            unmute: "A",
            onlyYT: "O",
            showSite: "R",
            ytLogo: "Y"
        },
        controlBar: null,
        loading: null,
        locationProtocol: "https:",

        filters: {
            grayscale: {
                value: 0,
                unit: "%"
            },
            hue_rotate: {
                value: 0,
                unit: "deg"
            },
            invert: {
                value: 0,
                unit: "%"
            },
            opacity: {
                value: 0,
                unit: "%"
            },
            saturate: {
                value: 0,
                unit: "%"
            },
            sepia: {
                value: 0,
                unit: "%"
            },
            brightness: {
                value: 0,
                unit: "%"
            },
            contrast: {
                value: 0,
                unit: "%"
            },
            blur: {
                value: 0,
                unit: "px"
            }
        },
        /**
         *
         * @param options
         * @returns [players]
         */
        buildPlayer: function (options) {
            return this.each(function () {
                var YTPlayer = this;
                var $YTPlayer = jQuery(YTPlayer);
                YTPlayer.loop = 0;
                YTPlayer.opt = {};
                YTPlayer.state = {};
                YTPlayer.filters = jQuery.mbYTPlayer.filters;
                YTPlayer.filtersEnabled = true;
                YTPlayer.id = YTPlayer.id || "YTP_" + new Date().getTime();
                $YTPlayer.addClass("mb_YTPlayer");
                var property = $YTPlayer.data("property") && typeof $YTPlayer.data("property") == "string" ? eval('(' + $YTPlayer.data("property") + ')') : $YTPlayer.data("property");
                if (typeof property != "undefined" && typeof property.vol != "undefined") property.vol = property.vol === 0 ? property.vol = 1 : property.vol;

                jQuery.extend(YTPlayer.opt, jQuery.mbYTPlayer.defaults, options, property);

                if (!YTPlayer.hasChanged) {
                    YTPlayer.defaultOpt = {};
                    jQuery.extend(YTPlayer.defaultOpt, jQuery.mbYTPlayer.defaults, options);
                }

                if (YTPlayer.opt.loop == "true")
                    YTPlayer.opt.loop = 9999;

                YTPlayer.isRetina = (window.retina || window.devicePixelRatio > 1);
                var isIframe = function () {
                    var isIfr = false;
                    try {
                        if (self.location.href != top.location.href) isIfr = true;
                    } catch (e) {
                        isIfr = true;
                    }
                    return isIfr;
                };

                YTPlayer.canGoFullScreen = !(jQuery.mbBrowser.msie || jQuery.mbBrowser.opera || isIframe());
                if (!YTPlayer.canGoFullScreen) YTPlayer.opt.realfullscreen = false;
                if (!$YTPlayer.attr("id")) $YTPlayer.attr("id", "ytp_" + new Date().getTime());
                var playerID = "iframe_" + YTPlayer.id;
                YTPlayer.isAlone = false;
                YTPlayer.hasFocus = true;
                YTPlayer.videoID = this.opt.videoURL ? getYTPVideoID(this.opt.videoURL).videoID : $YTPlayer.attr("href") ? getYTPVideoID($YTPlayer.attr("href")).videoID : false;
                YTPlayer.playlistID = this.opt.videoURL ? getYTPVideoID(this.opt.videoURL).playlistID : $YTPlayer.attr("href") ? getYTPVideoID($YTPlayer.attr("href")).playlistID : false;

                YTPlayer.opt.showAnnotations = YTPlayer.opt.showAnnotations ? '1' : '3';

                var start_from_last = 0;

                if (jQuery.mbCookie.get("YTPlayer_" + YTPlayer.videoID))
                    start_from_last = parseFloat(jQuery.mbCookie.get("YTPlayer_" + YTPlayer.videoID));

                if (YTPlayer.opt.remember_last_time && start_from_last) {
                    YTPlayer.start_from_last = start_from_last;
                    jQuery.mbCookie.remove("YTPlayer_" + YTPlayer.videoID);
                }

                var playerVars = {
                    'modestbranding': 1,
                    'autoplay': 0,
                    'controls': 0,
                    'showinfo': 0,
                    'rel': 0,
                    'enablejsapi': 1,
                    'version': 3,
                    'playerapiid': playerID,
                    'origin': '*',
                    'allowfullscreen': true,
                    'wmode': 'transparent',
                    'iv_load_policy': YTPlayer.opt.showAnnotations
                };

                if (document.createElement('video').canPlayType) jQuery.extend(playerVars, {
                    'html5': 1
                });
                if (jQuery.mbBrowser.msie && jQuery.mbBrowser.version < 9) this.opt.opacity = 1;

                YTPlayer.isSelf = YTPlayer.opt.containment == "self";
                YTPlayer.defaultOpt.containment = YTPlayer.opt.containment = YTPlayer.opt.containment == "self" ? jQuery(this) : jQuery(YTPlayer.opt.containment);
                YTPlayer.isBackground = YTPlayer.opt.containment.is("body");

                if (YTPlayer.isBackground && ytp.backgroundIsInited)
                    return;

                var isPlayer = YTPlayer.opt.containment.is(jQuery(this));

                YTPlayer.canPlayOnMobile = isPlayer && jQuery(this).children().length === 0;
                YTPlayer.isPlayer = false;

                /**
                 * Hide the placeholder if it's not the target of the player
                 */
                if (!isPlayer) {
                    $YTPlayer.hide();
                } else {
                    YTPlayer.isPlayer = true;
                }

                var overlay = jQuery("<div/>").css({
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%"
                }).addClass("YTPOverlay");

                if (YTPlayer.isPlayer) {
                    overlay.on("click", function () {
                        $YTPlayer.YTPTogglePlay();
                    })
                }

                var wrapper = jQuery("<div/>").addClass("mbYTP_wrapper").attr("id", "wrapper_" + YTPlayer.id);
                wrapper.css({
                    position: "absolute",
                    zIndex: 0,
                    minWidth: "100%",
                    minHeight: "100%",
                    left: 0,
                    top: 0,
                    overflow: "hidden",
                    opacity: 0
                });

                var playerBox = jQuery("<div/>").attr("id", playerID).addClass("playerBox");
                playerBox.css({
                    position: "absolute",
                    zIndex: 0,
                    width: "100%",
                    height: "100%",
                    top: 0,
                    left: 0,
                    overflow: "hidden"
                });

                wrapper.append(playerBox);

                YTPlayer.opt.containment.children().not("script, style").each(function () {
                    if (jQuery(this).css("position") == "static") jQuery(this).css("position", "relative");
                });

                if (YTPlayer.isBackground) {
                    jQuery("body").css({
                        boxSizing: "border-box"
                    });

                    wrapper.css({
                        position: "fixed",
                        top: 0,
                        left: 0,
                        zIndex: 0
                    });

                    $YTPlayer.hide();

                } else if (YTPlayer.opt.containment.css("position") == "static")
                    YTPlayer.opt.containment.css({
                        position: "relative"
                    });

                YTPlayer.opt.containment.prepend(wrapper);
                YTPlayer.wrapper = wrapper;

                playerBox.css({
                    opacity: 1
                });

                if (!jQuery.mbBrowser.mobile) {
                    playerBox.after(overlay);
                    YTPlayer.overlay = overlay;
                }

                if (!YTPlayer.isBackground) {
                    overlay.on("mouseenter", function () {
                        if (YTPlayer.controlBar && YTPlayer.controlBar.length)
                            YTPlayer.controlBar.addClass("visible");
                    }).on("mouseleave", function () {
                        if (YTPlayer.controlBar && YTPlayer.controlBar.length)
                            YTPlayer.controlBar.removeClass("visible");
                    });
                }

                if (!ytp.YTAPIReady) {
                    jQuery("#YTAPI").remove();
                    var tag = jQuery("<script></script>").attr({
                        "src": jQuery.mbYTPlayer.locationProtocol + "//www.youtube.com/iframe_api?v=" + jQuery.mbYTPlayer.version,
                        "id": "YTAPI"
                    });
                    jQuery("head").prepend(tag);
                } else {
                    setTimeout(function () {
                        jQuery(document).trigger("YTAPIReady");
                    }, 100)
                }

                if (jQuery.mbBrowser.mobile && !YTPlayer.canPlayOnMobile) {

                    if (YTPlayer.opt.mobileFallbackImage) {
                        wrapper.css({
                            backgroundImage: "url(" + YTPlayer.opt.mobileFallbackImage + ")",
                            backgroundPosition: "center center",
                            backgroundSize: "cover",
                            backgroundRepeat: "no-repeat",
                            opacity: 1
                        })
                    }
                    $YTPlayer.remove();
                    jQuery(document).trigger("YTPUnavailable");
                    return;
                }

                jQuery(document).on("YTAPIReady", function () {
                    if ((YTPlayer.isBackground && ytp.backgroundIsInited) || YTPlayer.isInit) return;
                    if (YTPlayer.isBackground) {
                        ytp.backgroundIsInited = true;
                    }

                    YTPlayer.opt.autoPlay = typeof YTPlayer.opt.autoPlay == "undefined" ? (YTPlayer.isBackground ? true : false) : YTPlayer.opt.autoPlay;
                    YTPlayer.opt.vol = YTPlayer.opt.vol ? YTPlayer.opt.vol : 100;
                    jQuery.mbYTPlayer.getDataFromAPI(YTPlayer);
                    jQuery(YTPlayer).on("YTPChanged", function () {

                        if (YTPlayer.isInit)
                            return;

                        YTPlayer.isInit = true;

                        //if is mobile && isPlayer fallback to the default YT player
                        if (jQuery.mbBrowser.mobile && YTPlayer.canPlayOnMobile) {
                            // Try to adjust the player dimention
                            if (YTPlayer.opt.containment.outerWidth() > jQuery(window).width()) {
                                YTPlayer.opt.containment.css({
                                    maxWidth: "100%"
                                });
                                var h = YTPlayer.opt.containment.outerWidth() * .563;
                                YTPlayer.opt.containment.css({
                                    maxHeight: h
                                });
                            }
                            new YT.Player(playerID, {
                                videoId: YTPlayer.videoID.toString(),
                                width: '100%',
                                height: h,
                                playerVars: playerVars,
                                events: {
                                    'onReady': function (event) {
                                        YTPlayer.player = event.target;
                                        playerBox.css({
                                            opacity: 1
                                        });
                                        YTPlayer.wrapper.css({
                                            opacity: 1
                                        });
                                    }
                                }
                            });
                            return;
                        }

                        new YT.Player(playerID, {
                            videoId: YTPlayer.videoID.toString(),
                            playerVars: playerVars,
                            events: {
                                'onReady': function (event) {
                                    YTPlayer.player = event.target;
                                    if (YTPlayer.isReady) return;
                                    YTPlayer.isReady = YTPlayer.isPlayer && !YTPlayer.opt.autoPlay ? false : true;
                                    YTPlayer.playerEl = YTPlayer.player.getIframe();

                                    jQuery(YTPlayer.playerEl).unselectable();

                                    $YTPlayer.optimizeDisplay();
                                    jQuery(window).off("resize.YTP_" + YTPlayer.id).on("resize.YTP_" + YTPlayer.id, function () {
                                        $YTPlayer.optimizeDisplay();
                                    });

                                    if (YTPlayer.opt.remember_last_time) {

                                        jQuery(window).on("unload.YTP_" + YTPlayer.id, function () {
                                            var current_time = YTPlayer.player.getCurrentTime();

                                            jQuery.mbCookie.set("YTPlayer_" + YTPlayer.videoID, current_time, 1);
                                        });

                                    }

                                    jQuery.mbYTPlayer.checkForState(YTPlayer);
                                },
                                /**
                                 *
                                 * @param event
                                 *
                                 * -1 (unstarted)
                                 * 0 (ended)
                                 * 1 (playing)
                                 * 2 (paused)
                                 * 3 (buffering)
                                 * 5 (video cued).
                                 *
                                 *
                                 */
                                'onStateChange': function (event) {
                                    if (typeof event.target.getPlayerState != "function") return;
                                    var state = event.target.getPlayerState();

                                    if (YTPlayer.preventTrigger) {
                                        YTPlayer.preventTrigger = false;
                                        return
                                    }

                                    /*
									 if( YTPlayer.state == state )
									 return;
									 */

                                    YTPlayer.state = state;

                                    var eventType;
                                    switch (state) {
                                        case -1: //----------------------------------------------- unstarted
                                            eventType = "YTPUnstarted";
                                            break;
                                        case 0: //------------------------------------------------ ended
                                            eventType = "YTPRealEnd";
                                            break;
                                        case 1: //------------------------------------------------ play
                                            eventType = "YTPPlay";
                                            if (YTPlayer.controlBar.length)
                                                YTPlayer.controlBar.find(".mb_YTPPlaypause").html(jQuery.mbYTPlayer.controls.pause);
                                            if (typeof _gaq != "undefined" && eval(YTPlayer.opt.gaTrack)) _gaq.push(['_trackEvent', 'YTPlayer', 'Play', (YTPlayer.hasData ? YTPlayer.videoData.title : YTPlayer.videoID.toString())]);
                                            if (typeof ga != "undefined" && eval(YTPlayer.opt.gaTrack)) ga('send', 'event', 'YTPlayer', 'play', (YTPlayer.hasData ? YTPlayer.videoData.title : YTPlayer.videoID.toString()));
                                            break;
                                        case 2: //------------------------------------------------ pause
                                            eventType = "YTPPause";
                                            if (YTPlayer.controlBar.length)
                                                YTPlayer.controlBar.find(".mb_YTPPlaypause").html(jQuery.mbYTPlayer.controls.play);
                                            break;
                                        case 3: //------------------------------------------------ buffer
                                            YTPlayer.player.setPlaybackQuality(YTPlayer.opt.quality);
                                            eventType = "YTPBuffering";
                                            if (YTPlayer.controlBar.length)
                                                YTPlayer.controlBar.find(".mb_YTPPlaypause").html(jQuery.mbYTPlayer.controls.play);
                                            break;
                                        case 5: //------------------------------------------------ cued
                                            eventType = "YTPCued";
                                            break;
                                        default:
                                            break;
                                    }

                                    // Trigger state events
                                    var YTPEvent = jQuery.Event(eventType);
                                    YTPEvent.time = YTPlayer.currentTime;
                                    if (YTPlayer.canTrigger) jQuery(YTPlayer).trigger(YTPEvent);
                                },
                                /**
                                 *
                                 * @param e
                                 */
                                'onPlaybackQualityChange': function (e) {
                                    var quality = e.target.getPlaybackQuality();
                                    var YTPQualityChange = jQuery.Event("YTPQualityChange");
                                    YTPQualityChange.quality = quality;
                                    jQuery(YTPlayer).trigger(YTPQualityChange);
                                },
                                /**
                                 *
                                 * @param err
                                 */
                                'onError': function (err) {

                                    if (err.data == 150) {
                                        console.log("Embedding this video is restricted by Youtube.");
                                        if (YTPlayer.isPlayList)
                                            jQuery(YTPlayer).playNext();
                                    }

                                    if (err.data == 2 && YTPlayer.isPlayList) {
                                        jQuery(YTPlayer).playNext();
                                    }

                                    if (typeof YTPlayer.opt.onError == "function")
                                        YTPlayer.opt.onError($YTPlayer, err);
                                }
                            }
                        });
                    });
                });

                $YTPlayer.off("YTPTime.mask");

                jQuery.mbYTPlayer.applyMask(YTPlayer);

            });
        },
        /**
         *
         * @param YTPlayer
         */
        getDataFromAPI: function (YTPlayer) {
            YTPlayer.videoData = jQuery.mbStorage.get("YTPlayer_data_" + YTPlayer.videoID);
            jQuery(YTPlayer).off("YTPData.YTPlayer").on("YTPData.YTPlayer", function () {
                if (YTPlayer.hasData) {

                    if (YTPlayer.isPlayer && !YTPlayer.opt.autoPlay) {
                        var bgndURL = YTPlayer.videoData.thumb_max || YTPlayer.videoData.thumb_high || YTPlayer.videoData.thumb_medium;

                        YTPlayer.opt.containment.css({
                            background: "rgba(0,0,0,0.5) url(" + bgndURL + ") center center",
                            backgroundSize: "cover"
                        });
                        YTPlayer.opt.backgroundUrl = bgndURL;
                    }
                }
            });

            if (YTPlayer.videoData) {

                setTimeout(function () {
                    YTPlayer.opt.ratio = YTPlayer.opt.ratio == "auto" ? "16/9" : YTPlayer.opt.ratio;
                    YTPlayer.dataReceived = true;
                    jQuery(YTPlayer).trigger("YTPChanged");
                    var YTPData = jQuery.Event("YTPData");
                    YTPData.prop = {};
                    for (var x in YTPlayer.videoData) YTPData.prop[x] = YTPlayer.videoData[x];
                    jQuery(YTPlayer).trigger(YTPData);
                }, YTPlayer.opt.fadeOnStartTime);

                YTPlayer.hasData = true;
            } else if (jQuery.mbYTPlayer.apiKey) {
                // Get video info from API3 (needs api key)
                // snippet,player,contentDetails,statistics,status
                jQuery.getJSON(jQuery.mbYTPlayer.locationProtocol + "//www.googleapis.com/youtube/v3/videos?id=" + YTPlayer.videoID + "&key=" + jQuery.mbYTPlayer.apiKey + "&part=snippet", function (data) {
                    YTPlayer.dataReceived = true;
                    jQuery(YTPlayer).trigger("YTPChanged");

                    function parseYTPlayer_data(data) {
                        YTPlayer.videoData = {};
                        YTPlayer.videoData.id = YTPlayer.videoID;
                        YTPlayer.videoData.channelTitle = data.channelTitle;
                        YTPlayer.videoData.title = data.title;
                        YTPlayer.videoData.description = data.description.length < 400 ? data.description : data.description.substring(0, 400) + " ...";
                        YTPlayer.videoData.aspectratio = YTPlayer.opt.ratio == "auto" ? "16/9" : YTPlayer.opt.ratio;
                        YTPlayer.opt.ratio = YTPlayer.videoData.aspectratio;
                        YTPlayer.videoData.thumb_max = data.thumbnails.maxres ? data.thumbnails.maxres.url : null;
                        YTPlayer.videoData.thumb_high = data.thumbnails.high ? data.thumbnails.high.url : null;
                        YTPlayer.videoData.thumb_medium = data.thumbnails.medium ? data.thumbnails.medium.url : null;
                        jQuery.mbStorage.set("YTPlayer_data_" + YTPlayer.videoID, YTPlayer.videoData);
                    }

                    parseYTPlayer_data(data.items[0].snippet);
                    YTPlayer.hasData = true;
                    var YTPData = jQuery.Event("YTPData");
                    YTPData.prop = {};
                    for (var x in YTPlayer.videoData) YTPData.prop[x] = YTPlayer.videoData[x];
                    jQuery(YTPlayer).trigger(YTPData);
                });
            } else {
                setTimeout(function () {
                    jQuery(YTPlayer).trigger("YTPChanged");
                }, 50);
                if (YTPlayer.isPlayer && !YTPlayer.opt.autoPlay) {
                    var bgndURL = jQuery.mbYTPlayer.locationProtocol + "//i.ytimg.com/vi/" + YTPlayer.videoID + "/hqdefault.jpg";

                    if (bgndURL)
                        YTPlayer.opt.containment.css({
                            background: "rgba(0,0,0,0.5) url(" + bgndURL + ") center center",
                            backgroundSize: "cover"
                        });
                    YTPlayer.opt.backgroundUrl = bgndURL;

                }
                YTPlayer.videoData = null;
                YTPlayer.opt.ratio = YTPlayer.opt.ratio == "auto" ? "16/9" : YTPlayer.opt.ratio;
            }
            if (YTPlayer.isPlayer && !YTPlayer.opt.autoPlay && !jQuery.mbBrowser.mobile) {
                YTPlayer.loading = jQuery("<div/>").addClass("loading").html("Loading").hide();
                jQuery(YTPlayer).append(YTPlayer.loading);
                YTPlayer.loading.fadeIn();
            }
        },
        /**
         *
         */
        removeStoredData: function () {
            jQuery.mbStorage.remove();
        },
        /**
         *
         * @returns {*|YTPlayer.videoData}
         */
        getVideoData: function () {
            var YTPlayer = this.get(0);
            return YTPlayer.videoData;
        },
        /**
         *
         * @returns {*|YTPlayer.videoID|boolean}
         */
        getVideoID: function () {
            var YTPlayer = this.get(0);
            return YTPlayer.videoID || false;
        },
        /**
         *
         * @param quality
         */
        setVideoQuality: function (quality) {
            var YTPlayer = this.get(0);
            YTPlayer.player.setPlaybackQuality(quality);
        },
        /**
         *
         * @param videos
         * @param shuffle
         * @param callback
         * @returns {jQuery.mbYTPlayer}
         */
        playlist: function (videos, shuffle, callback) {
            var $YTPlayer = this;
            var YTPlayer = $YTPlayer.get(0);
            YTPlayer.isPlayList = true;
            if (shuffle) videos = jQuery.shuffle(videos);
            if (!YTPlayer.videoID) {
                YTPlayer.videos = videos;
                YTPlayer.videoCounter = 0;
                YTPlayer.videoLength = videos.length;
                jQuery(YTPlayer).data("property", videos[0]);
                jQuery(YTPlayer).mb_YTPlayer();
            }
            if (typeof callback == "function") jQuery(YTPlayer).one("YTPChanged", function () {
                callback(YTPlayer);
            });
            jQuery(YTPlayer).on("YTPEnd", function () {
                jQuery(YTPlayer).playNext();
            });
            return this;
        },
        /**
         *
         * @returns {jQuery.mbYTPlayer}
         */
        playNext: function () {
            var YTPlayer = this.get(0);

            if (YTPlayer.checkForStartAt) {
                clearInterval(YTPlayer.checkForStartAt);
                clearInterval(YTPlayer.getState);
            }

            YTPlayer.videoCounter++;

            if (YTPlayer.videoCounter >= YTPlayer.videoLength)
                YTPlayer.videoCounter = 0;

            jQuery(YTPlayer).YTPChangeMovie(YTPlayer.videos[YTPlayer.videoCounter]);

            return this;
        },
        /**
         *
         * @returns {jQuery.mbYTPlayer}
         */
        playPrev: function () {
            var YTPlayer = this.get(0);

            if (YTPlayer.checkForStartAt) {
                clearInterval(YTPlayer.checkForStartAt);
                clearInterval(YTPlayer.getState);
            }

            YTPlayer.videoCounter--;

            if (YTPlayer.videoCounter < 0)
                YTPlayer.videoCounter = YTPlayer.videoLength - 1;

            jQuery(YTPlayer).YTPChangeMovie(YTPlayer.videos[YTPlayer.videoCounter]);

            return this;
        },
        /**
         *
         * @returns {jQuery.mbYTPlayer}
         */
        playIndex: function (idx) {
            var YTPlayer = this.get(0);

            idx = idx - 1;

            if (YTPlayer.checkForStartAt) {
                clearInterval(YTPlayer.checkForStartAt);
                clearInterval(YTPlayer.getState);
            }

            YTPlayer.videoCounter = idx;
            if (YTPlayer.videoCounter >= YTPlayer.videoLength - 1)
                YTPlayer.videoCounter = YTPlayer.videoLength - 1;
            jQuery(YTPlayer).YTPChangeMovie(YTPlayer.videos[YTPlayer.videoCounter]);
            return this;
        },
        /**
         *
         * @param opt
         */
        changeMovie: function (opt) {

            var $YTPlayer = this;
            var YTPlayer = $YTPlayer.get(0);
            YTPlayer.opt.startAt = 0;
            YTPlayer.opt.stopAt = 0;
            YTPlayer.opt.mask = false;
            YTPlayer.opt.mute = true;
            YTPlayer.hasData = false;
            YTPlayer.hasChanged = true;
            YTPlayer.player.loopTime = undefined;

            if (opt)
                jQuery.extend(YTPlayer.opt, opt); //YTPlayer.defaultOpt,
            YTPlayer.videoID = getYTPVideoID(YTPlayer.opt.videoURL).videoID;

            if (YTPlayer.opt.loop == "true")
                YTPlayer.opt.loop = 9999;

            jQuery(YTPlayer.playerEl).CSSAnimate({
                opacity: 0
            }, YTPlayer.opt.fadeOnStartTime, function () {

                var YTPChangeMovie = jQuery.Event("YTPChangeMovie");
                YTPChangeMovie.time = YTPlayer.currentTime;
                YTPChangeMovie.videoId = YTPlayer.videoID;
                jQuery(YTPlayer).trigger(YTPChangeMovie);

                jQuery(YTPlayer).YTPGetPlayer().cueVideoByUrl(encodeURI(jQuery.mbYTPlayer.locationProtocol + "//www.youtube.com/v/" + YTPlayer.videoID), 1, YTPlayer.opt.quality);
                jQuery(YTPlayer).optimizeDisplay();

                jQuery.mbYTPlayer.checkForState(YTPlayer);
                jQuery.mbYTPlayer.getDataFromAPI(YTPlayer);

            });

            jQuery.mbYTPlayer.applyMask(YTPlayer);
        },
        /**
         *
         * @returns {player}
         */
        getPlayer: function () {
            return jQuery(this).get(0).player;
        },

        playerDestroy: function () {
            var YTPlayer = this.get(0);
            ytp.YTAPIReady = true;
            ytp.backgroundIsInited = false;
            YTPlayer.isInit = false;
            YTPlayer.videoID = null;
            YTPlayer.isReady = false;
            var playerBox = YTPlayer.wrapper;
            playerBox.remove();
            jQuery("#controlBar_" + YTPlayer.id).remove();
            clearInterval(YTPlayer.checkForStartAt);
            clearInterval(YTPlayer.getState);
            return this;
        },

        /**
         *
         * @param real
         * @returns {jQuery.mbYTPlayer}
         */
        fullscreen: function (real) {
            var YTPlayer = this.get(0);
            if (typeof real == "undefined") real = YTPlayer.opt.realfullscreen;
            real = eval(real);
            var controls = jQuery("#controlBar_" + YTPlayer.id);
            var fullScreenBtn = controls.find(".mb_OnlyYT");
            var videoWrapper = YTPlayer.isSelf ? YTPlayer.opt.containment : YTPlayer.wrapper;
            //var videoWrapper = YTPlayer.wrapper;
            if (real) {
                var fullscreenchange = jQuery.mbBrowser.mozilla ? "mozfullscreenchange" : jQuery.mbBrowser.webkit ? "webkitfullscreenchange" : "fullscreenchange";
                jQuery(document).off(fullscreenchange).on(fullscreenchange, function () {
                    var isFullScreen = RunPrefixMethod(document, "IsFullScreen") || RunPrefixMethod(document, "FullScreen");
                    if (!isFullScreen) {
                        YTPlayer.isAlone = false;
                        fullScreenBtn.html(jQuery.mbYTPlayer.controls.onlyYT);
                        jQuery(YTPlayer).YTPSetVideoQuality(YTPlayer.opt.quality);
                        videoWrapper.removeClass("YTPFullscreen");
                        videoWrapper.CSSAnimate({
                            opacity: YTPlayer.opt.opacity
                        }, YTPlayer.opt.fadeOnStartTime);
                        videoWrapper.css({
                            zIndex: 0
                        });
                        if (YTPlayer.isBackground) {
                            jQuery("body").after(controls);
                        } else {
                            YTPlayer.wrapper.before(controls);
                        }
                        jQuery(window).resize();
                        jQuery(YTPlayer).trigger("YTPFullScreenEnd");
                    } else {
                        jQuery(YTPlayer).YTPSetVideoQuality("default");
                        jQuery(YTPlayer).trigger("YTPFullScreenStart");
                    }
                });
            }
            if (!YTPlayer.isAlone) {
                function hideMouse() {
                    YTPlayer.overlay.css({
                        cursor: "none"
                    });
                }

                jQuery(document).on("mousemove.YTPlayer", function (e) {
                    YTPlayer.overlay.css({
                        cursor: "auto"
                    });
                    clearTimeout(YTPlayer.hideCursor);
                    if (!jQuery(e.target).parents().is(".mb_YTPBar")) YTPlayer.hideCursor = setTimeout(hideMouse, 3000);
                });
                hideMouse();
                if (real) {
                    videoWrapper.css({
                        opacity: 0
                    });
                    videoWrapper.addClass("YTPFullscreen");
                    launchFullscreen(videoWrapper.get(0));
                    setTimeout(function () {
                        videoWrapper.CSSAnimate({
                            opacity: 1
                        }, YTPlayer.opt.fadeOnStartTime * 2);
                        YTPlayer.wrapper.append(controls);
                        jQuery(YTPlayer).optimizeDisplay();
                        YTPlayer.player.seekTo(YTPlayer.player.getCurrentTime() + .1, true);
                    }, YTPlayer.opt.fadeOnStartTime)
                } else videoWrapper.css({
                    zIndex: 10000
                }).CSSAnimate({
                    opacity: 1
                }, YTPlayer.opt.fadeOnStartTime * 2);
                fullScreenBtn.html(jQuery.mbYTPlayer.controls.showSite);
                YTPlayer.isAlone = true;
            } else {
                jQuery(document).off("mousemove.YTPlayer");
                clearTimeout(YTPlayer.hideCursor);
                YTPlayer.overlay.css({
                    cursor: "auto"
                });
                if (real) {
                    cancelFullscreen();
                } else {
                    videoWrapper.CSSAnimate({
                        opacity: YTPlayer.opt.opacity
                    }, YTPlayer.opt.fadeOnStartTime);
                    videoWrapper.css({
                        zIndex: 0
                    });
                }
                fullScreenBtn.html(jQuery.mbYTPlayer.controls.onlyYT);
                YTPlayer.isAlone = false;
            }

            function RunPrefixMethod(obj, method) {
                var pfx = ["webkit", "moz", "ms", "o", ""];
                var p = 0,
                    m, t;
                while (p < pfx.length && !obj[m]) {
                    m = method;
                    if (pfx[p] == "") {
                        m = m.substr(0, 1).toLowerCase() + m.substr(1);
                    }
                    m = pfx[p] + m;
                    t = typeof obj[m];
                    if (t != "undefined") {
                        pfx = [pfx[p]];
                        return (t == "function" ? obj[m]() : obj[m]);
                    }
                    p++;
                }
            }

            function launchFullscreen(element) {
                RunPrefixMethod(element, "RequestFullScreen");
            }

            function cancelFullscreen() {
                if (RunPrefixMethod(document, "FullScreen") || RunPrefixMethod(document, "IsFullScreen")) {
                    RunPrefixMethod(document, "CancelFullScreen");
                }
            }

            return this;
        },
        /**
         *
         * @returns {jQuery.mbYTPlayer}
         */
        toggleLoops: function () {
            var YTPlayer = this.get(0);
            var data = YTPlayer.opt;
            if (data.loop == 1) {
                data.loop = 0;
            } else {
                if (data.startAt) {
                    YTPlayer.player.seekTo(data.startAt);
                } else {
                    YTPlayer.player.playVideo();
                }
                data.loop = 1;
            }
            return this;
        },
        /**
         *
         * @returns {jQuery.mbYTPlayer}
         */
        play: function () {
            var YTPlayer = this.get(0);
            if (!YTPlayer.isReady)
                return this;

            YTPlayer.player.playVideo();
            YTPlayer.wrapper.CSSAnimate({
                opacity: YTPlayer.isAlone ? 1 : YTPlayer.opt.opacity
            }, YTPlayer.opt.fadeOnStartTime * 4);

            jQuery(YTPlayer.playerEl).CSSAnimate({
                opacity: 1
            }, YTPlayer.opt.fadeOnStartTime * 2);

            var controls = jQuery("#controlBar_" + YTPlayer.id);
            var playBtn = controls.find(".mb_YTPPlaypause");
            playBtn.html(jQuery.mbYTPlayer.controls.pause);
            YTPlayer.state = 1;
            YTPlayer.orig_background = jQuery(YTPlayer).css("background-image");

            return this;
        },
        /**
         *
         * @param callback
         * @returns {jQuery.mbYTPlayer}
         */
        togglePlay: function (callback) {
            var YTPlayer = this.get(0);
            if (YTPlayer.state == 1)
                this.YTPPause();
            else
                this.YTPPlay();

            if (typeof callback == "function")
                callback(YTPlayer.state);

            return this;
        },
        /**
         *
         * @returns {jQuery.mbYTPlayer}
         */
        stop: function () {
            var YTPlayer = this.get(0);
            var controls = jQuery("#controlBar_" + YTPlayer.id);
            var playBtn = controls.find(".mb_YTPPlaypause");
            playBtn.html(jQuery.mbYTPlayer.controls.play);
            YTPlayer.player.stopVideo();
            return this;
        },
        /**
         *
         * @returns {jQuery.mbYTPlayer}
         */
        pause: function () {
            var YTPlayer = this.get(0);
            YTPlayer.player.pauseVideo();
            YTPlayer.state = 2;
            return this;
        },
        /**
         *
         * @param val
         * @returns {jQuery.mbYTPlayer}
         */
        seekTo: function (val) {
            var YTPlayer = this.get(0);
            YTPlayer.player.seekTo(val, true);
            return this;
        },
        /**
         *
         * @param val
         * @returns {jQuery.mbYTPlayer}
         */
        setVolume: function (val) {
            var YTPlayer = this.get(0);
            if (!val && !YTPlayer.opt.vol && YTPlayer.player.getVolume() == 0) jQuery(YTPlayer).YTPUnmute();
            else if ((!val && YTPlayer.player.getVolume() > 0) || (val && YTPlayer.opt.vol == val)) {
                if (!YTPlayer.isMute) jQuery(YTPlayer).YTPMute();
                else jQuery(YTPlayer).YTPUnmute();
            } else {
                YTPlayer.opt.vol = val;
                YTPlayer.player.setVolume(YTPlayer.opt.vol);
                if (YTPlayer.volumeBar && YTPlayer.volumeBar.length) YTPlayer.volumeBar.updateSliderVal(val)
            }
            return this;
        },
        /**
         *
         * @returns {boolean}
         */
        toggleVolume: function () {
            var YTPlayer = this.get(0);
            if (!YTPlayer) return;
            if (YTPlayer.player.isMuted()) {
                jQuery(YTPlayer).YTPUnmute();
                return true;
            } else {
                jQuery(YTPlayer).YTPMute();
                return false;
            }
        },
        /**
         *
         * @returns {jQuery.mbYTPlayer}
         */
        mute: function () {
            var YTPlayer = this.get(0);
            if (YTPlayer.isMute) return;
            YTPlayer.player.mute();
            YTPlayer.isMute = true;
            YTPlayer.player.setVolume(0);
            if (YTPlayer.volumeBar && YTPlayer.volumeBar.length && YTPlayer.volumeBar.width() > 10) {
                YTPlayer.volumeBar.updateSliderVal(0);
            }
            var controls = jQuery("#controlBar_" + YTPlayer.id);
            var muteBtn = controls.find(".mb_YTPMuteUnmute");
            muteBtn.html(jQuery.mbYTPlayer.controls.unmute);
            jQuery(YTPlayer).addClass("isMuted");
            if (YTPlayer.volumeBar && YTPlayer.volumeBar.length) YTPlayer.volumeBar.addClass("muted");
            var YTPEvent = jQuery.Event("YTPMuted");
            YTPEvent.time = YTPlayer.currentTime;
            if (YTPlayer.canTrigger) jQuery(YTPlayer).trigger(YTPEvent);
            return this;
        },
        /**
         *
         * @returns {jQuery.mbYTPlayer}
         */
        unmute: function () {
            var YTPlayer = this.get(0);
            if (!YTPlayer.isMute) return;
            YTPlayer.player.unMute();
            YTPlayer.isMute = false;
            YTPlayer.player.setVolume(YTPlayer.opt.vol);
            if (YTPlayer.volumeBar && YTPlayer.volumeBar.length) YTPlayer.volumeBar.updateSliderVal(YTPlayer.opt.vol > 10 ? YTPlayer.opt.vol : 10);
            var controls = jQuery("#controlBar_" + YTPlayer.id);
            var muteBtn = controls.find(".mb_YTPMuteUnmute");
            muteBtn.html(jQuery.mbYTPlayer.controls.mute);
            jQuery(YTPlayer).removeClass("isMuted");
            if (YTPlayer.volumeBar && YTPlayer.volumeBar.length) YTPlayer.volumeBar.removeClass("muted");
            var YTPEvent = jQuery.Event("YTPUnmuted");
            YTPEvent.time = YTPlayer.currentTime;
            if (YTPlayer.canTrigger) jQuery(YTPlayer).trigger(YTPEvent);
            return this;
        },
        /**
         * FILTERS
         *
         *
         * @param filter
         * @param value
         * @returns {jQuery.mbYTPlayer}
         */
        applyFilter: function (filter, value) {
            return this.each(function () {
                var YTPlayer = this;
                YTPlayer.filters[filter].value = value;
                if (YTPlayer.filtersEnabled)
                    jQuery(YTPlayer).YTPEnableFilters();
            });
        },
        /**
         *
         * @param filters
         * @returns {jQuery.mbYTPlayer}
         */
        applyFilters: function (filters) {
            return this.each(function () {
                var YTPlayer = this;
                if (!YTPlayer.isReady) {
                    jQuery(YTPlayer).on("YTPReady", function () {
                        jQuery(YTPlayer).YTPApplyFilters(filters);
                    });
                    return;
                }

                for (var key in filters)
                    jQuery(YTPlayer).YTPApplyFilter(key, filters[key]);

                jQuery(YTPlayer).trigger("YTPFiltersApplied");
            });
        },
        /**
         *
         * @param filter
         * @param value
         * @returns {*}
         */
        toggleFilter: function (filter, value) {
            return this.each(function () {
                var YTPlayer = this;
                if (!YTPlayer.filters[filter].value) YTPlayer.filters[filter].value = value;
                else YTPlayer.filters[filter].value = 0;
                if (YTPlayer.filtersEnabled) jQuery(this).YTPEnableFilters();
            });
        },
        /**
         *
         * @param callback
         * @returns {*}
         */
        toggleFilters: function (callback) {
            return this.each(function () {
                var YTPlayer = this;
                if (YTPlayer.filtersEnabled) {
                    jQuery(YTPlayer).trigger("YTPDisableFilters");
                    jQuery(YTPlayer).YTPDisableFilters();
                } else {
                    jQuery(YTPlayer).YTPEnableFilters();
                    jQuery(YTPlayer).trigger("YTPEnableFilters");
                }
                if (typeof callback == "function")
                    callback(YTPlayer.filtersEnabled);
            })
        },
        /**
         *
         * @returns {*}
         */
        disableFilters: function () {
            return this.each(function () {
                var YTPlayer = this;
                var iframe = jQuery(YTPlayer.playerEl);
                iframe.css("-webkit-filter", "");
                iframe.css("filter", "");
                YTPlayer.filtersEnabled = false;
            })
        },
        /**
         *
         * @returns {*}
         */
        enableFilters: function () {
            return this.each(function () {
                var YTPlayer = this;
                var iframe = jQuery(YTPlayer.playerEl);
                var filterStyle = "";
                for (var key in YTPlayer.filters) {
                    if (YTPlayer.filters[key].value)
                        filterStyle += key.replace("_", "-") + "(" + YTPlayer.filters[key].value + YTPlayer.filters[key].unit + ") ";
                }
                iframe.css("-webkit-filter", filterStyle);
                iframe.css("filter", filterStyle);
                YTPlayer.filtersEnabled = true;
            });
        },
        /**
         *
         * @param filter
         * @param callback
         * @returns {*}
         */
        removeFilter: function (filter, callback) {
            return this.each(function () {
                var YTPlayer = this;
                if (typeof filter == "function") {
                    callback = filter;
                    filter = null;
                }
                if (!filter)
                    for (var key in YTPlayer.filters) {
                        jQuery(this).YTPApplyFilter(key, 0);
                        if (typeof callback == "function") callback(key);
                    } else {
                    jQuery(this).YTPApplyFilter(filter, 0);
                    if (typeof callback == "function") callback(filter);
                }
            });

        },
        /**
         *
         * @returns {*}
         */
        getFilters: function () {
            var YTPlayer = this.get(0);
            return YTPlayer.filters;
        },
        /**
         * MASK
         *
         *
         * @param mask
         * @returns {jQuery.mbYTPlayer}
         */
        addMask: function (mask) {
            var YTPlayer = this.get(0);
            var overlay = YTPlayer.overlay;

            if (!mask) {
                mask = YTPlayer.actualMask;
            }

            var tempImg = jQuery("<img/>").attr("src", mask).on("load", function () {

                overlay.CSSAnimate({
                    opacity: 0
                }, YTPlayer.opt.fadeOnStartTime, function () {

                    YTPlayer.hasMask = true;

                    tempImg.remove();

                    overlay.css({
                        backgroundImage: "url(" + mask + ")",
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "center center",
                        backgroundSize: "cover"
                    });

                    overlay.CSSAnimate({
                        opacity: 1
                    }, YTPlayer.opt.fadeOnStartTime);

                });

            });

            return this;

        },
        /**
         *
         * @returns {jQuery.mbYTPlayer}
         */
        removeMask: function () {
            var YTPlayer = this.get(0);
            var overlay = YTPlayer.overlay;
            overlay.CSSAnimate({
                opacity: 0
            }, YTPlayer.opt.fadeOnStartTime, function () {

                YTPlayer.hasMask = false;

                overlay.css({
                    backgroundImage: "",
                    backgroundRepeat: "",
                    backgroundPosition: "",
                    backgroundSize: ""
                });
                overlay.CSSAnimate({
                    opacity: 1
                }, YTPlayer.opt.fadeOnStartTime);

            });

            return this;

        },
        /**
         *
         * @param YTPlayer
         */
        applyMask: function (YTPlayer) {
            var $YTPlayer = jQuery(YTPlayer);
            $YTPlayer.off("YTPTime.mask");

            if (YTPlayer.opt.mask) {

                if (typeof YTPlayer.opt.mask == "string") {
                    $YTPlayer.YTPAddMask(YTPlayer.opt.mask);

                    YTPlayer.actualMask = YTPlayer.opt.mask;

                } else if (typeof YTPlayer.opt.mask == "object") {

                    for (var time in YTPlayer.opt.mask) {
                        if (YTPlayer.opt.mask[time])
                            var img = jQuery("<img/>").attr("src", YTPlayer.opt.mask[time]);
                    }

                    if (YTPlayer.opt.mask[0])
                        $YTPlayer.YTPAddMask(YTPlayer.opt.mask[0]);

                    $YTPlayer.on("YTPTime.mask", function (e) {
                        for (var time in YTPlayer.opt.mask) {
                            if (e.time == time)
                                if (!YTPlayer.opt.mask[time]) {
                                    $YTPlayer.YTPRemoveMask();
                                } else {

                                    $YTPlayer.YTPAddMask(YTPlayer.opt.mask[time]);
                                    YTPlayer.actualMask = YTPlayer.opt.mask[time];
                                }

                        }
                    });

                }


            }
        },
        /**
         *
         */
        toggleMask: function () {
            var YTPlayer = this.get(0);
            var $YTPlayer = $(YTPlayer);
            if (YTPlayer.hasMask)
                $YTPlayer.YTPRemoveMask();
            else
                $YTPlayer.YTPAddMask();

            return this;
        },
        /**
         *
         * @returns {{totalTime: number, currentTime: number}}
         */
        manageProgress: function () {
            var YTPlayer = this.get(0);
            var controls = jQuery("#controlBar_" + YTPlayer.id);
            var progressBar = controls.find(".mb_YTPProgress");
            var loadedBar = controls.find(".mb_YTPLoaded");
            var timeBar = controls.find(".mb_YTPseekbar");
            var totW = progressBar.outerWidth();
            var currentTime = Math.floor(YTPlayer.player.getCurrentTime());
            var totalTime = Math.floor(YTPlayer.player.getDuration());
            var timeW = (currentTime * totW) / totalTime;
            var startLeft = 0;
            var loadedW = YTPlayer.player.getVideoLoadedFraction() * 100;
            loadedBar.css({
                left: startLeft,
                width: loadedW + "%"
            });
            timeBar.css({
                left: 0,
                width: timeW
            });
            return {
                totalTime: totalTime,
                currentTime: currentTime
            };
        },
        /**
         *
         * @param YTPlayer
         */
        buildControls: function (YTPlayer) {
            var data = YTPlayer.opt;
            // @data.printUrl: is deprecated; use data.showYTLogo
            data.showYTLogo = data.showYTLogo || data.printUrl;

            if (jQuery("#controlBar_" + YTPlayer.id).length)
                return;
            YTPlayer.controlBar = jQuery("<span/>").attr("id", "controlBar_" + YTPlayer.id).addClass("mb_YTPBar").css({
                whiteSpace: "noWrap",
                position: YTPlayer.isBackground ? "fixed" : "absolute",
                zIndex: YTPlayer.isBackground ? 10000 : 1000
            }).hide();
            var buttonBar = jQuery("<div/>").addClass("buttonBar");
            /* play/pause button*/
            var playpause = jQuery("<span>" + jQuery.mbYTPlayer.controls.play + "</span>").addClass("mb_YTPPlaypause ytpicon").click(function () {
                if (YTPlayer.player.getPlayerState() == 1) jQuery(YTPlayer).YTPPause();
                else jQuery(YTPlayer).YTPPlay();
            });
            /* mute/unmute button*/
            var MuteUnmute = jQuery("<span>" + jQuery.mbYTPlayer.controls.mute + "</span>").addClass("mb_YTPMuteUnmute ytpicon").click(function () {
                if (YTPlayer.player.getVolume() == 0) {
                    jQuery(YTPlayer).YTPUnmute();
                } else {
                    jQuery(YTPlayer).YTPMute();
                }
            });
            /* volume bar*/
            var volumeBar = jQuery("<div/>").addClass("mb_YTPVolumeBar").css({
                display: "inline-block"
            });
            YTPlayer.volumeBar = volumeBar;
            /* time elapsed */
            var idx = jQuery("<span/>").addClass("mb_YTPTime");
            var vURL = data.videoURL ? data.videoURL : "";
            if (vURL.indexOf("http") < 0) vURL = jQuery.mbYTPlayer.locationProtocol + "//www.youtube.com/watch?v=" + data.videoURL;
            var movieUrl = jQuery("<span/>").html(jQuery.mbYTPlayer.controls.ytLogo).addClass("mb_YTPUrl ytpicon").attr("title", "view on YouTube").on("click", function () {
                window.open(vURL, "viewOnYT")
            });
            var onlyVideo = jQuery("<span/>").html(jQuery.mbYTPlayer.controls.onlyYT).addClass("mb_OnlyYT ytpicon").on("click", function () {
                jQuery(YTPlayer).YTPFullscreen(data.realfullscreen);
            });
            var progressBar = jQuery("<div/>").addClass("mb_YTPProgress").css("position", "absolute").click(function (e) {
                timeBar.css({
                    width: (e.clientX - timeBar.offset().left)
                });
                YTPlayer.timeW = e.clientX - timeBar.offset().left;
                YTPlayer.controlBar.find(".mb_YTPLoaded").css({
                    width: 0
                });
                var totalTime = Math.floor(YTPlayer.player.getDuration());
                YTPlayer.goto = (timeBar.outerWidth() * totalTime) / progressBar.outerWidth();
                YTPlayer.player.seekTo(parseFloat(YTPlayer.goto), true);
                YTPlayer.controlBar.find(".mb_YTPLoaded").css({
                    width: 0
                });
            });
            var loadedBar = jQuery("<div/>").addClass("mb_YTPLoaded").css("position", "absolute");
            var timeBar = jQuery("<div/>").addClass("mb_YTPseekbar").css("position", "absolute");
            progressBar.append(loadedBar).append(timeBar);
            buttonBar.append(playpause).append(MuteUnmute).append(volumeBar).append(idx);
            if (data.showYTLogo) {
                buttonBar.append(movieUrl);
            }
            if (YTPlayer.isBackground || (eval(YTPlayer.opt.realfullscreen) && !YTPlayer.isBackground)) buttonBar.append(onlyVideo);
            YTPlayer.controlBar.append(buttonBar).append(progressBar);
            if (!YTPlayer.isBackground) {
                YTPlayer.controlBar.addClass("inlinePlayer");
                YTPlayer.wrapper.before(YTPlayer.controlBar);
            } else {
                jQuery("body").after(YTPlayer.controlBar);
            }
            volumeBar.simpleSlider({
                initialval: YTPlayer.opt.vol,
                scale: 100,
                orientation: "h",
                callback: function (el) {
                    if (el.value == 0) {
                        jQuery(YTPlayer).YTPMute();
                    } else {
                        jQuery(YTPlayer).YTPUnmute();
                    }
                    YTPlayer.player.setVolume(el.value);
                    if (!YTPlayer.isMute) YTPlayer.opt.vol = el.value;
                }
            });
        },
        /**
         *
         * @param YTPlayer
         */
        checkForState: function (YTPlayer) {
            var interval = YTPlayer.opt.showControls ? 100 : 400;
            clearInterval(YTPlayer.getState);
            //Checking if player has been removed from scene
            if (!jQuery.contains(document, YTPlayer)) {
                jQuery(YTPlayer).YTPPlayerDestroy();
                clearInterval(YTPlayer.getState);
                clearInterval(YTPlayer.checkForStartAt);
                return;
            }

            jQuery.mbYTPlayer.checkForStart(YTPlayer);

            YTPlayer.getState = setInterval(function () {
                var prog = jQuery(YTPlayer).YTPManageProgress();
                var $YTPlayer = jQuery(YTPlayer);
                var data = YTPlayer.opt;
                var startAt = YTPlayer.opt.startAt ? YTPlayer.start_from_last ? YTPlayer.start_from_last : YTPlayer.opt.startAt : 1;
                YTPlayer.start_from_last = null;

                var stopAt = YTPlayer.opt.stopAt > YTPlayer.opt.startAt ? YTPlayer.opt.stopAt : 0;
                stopAt = stopAt < YTPlayer.player.getDuration() ? stopAt : 0;
                if (YTPlayer.currentTime != prog.currentTime) {

                    var YTPEvent = jQuery.Event("YTPTime");
                    YTPEvent.time = YTPlayer.currentTime;
                    jQuery(YTPlayer).trigger(YTPEvent);

                }
                YTPlayer.currentTime = prog.currentTime;
                YTPlayer.totalTime = YTPlayer.player.getDuration();
                if (YTPlayer.player.getVolume() == 0) $YTPlayer.addClass("isMuted");
                else $YTPlayer.removeClass("isMuted");

                if (YTPlayer.opt.showControls)
                    if (prog.totalTime) {
                        YTPlayer.controlBar.find(".mb_YTPTime").html(jQuery.mbYTPlayer.formatTime(prog.currentTime) + " / " + jQuery.mbYTPlayer.formatTime(prog.totalTime));
                    } else {
                        YTPlayer.controlBar.find(".mb_YTPTime").html("-- : -- / -- : --");
                    }

                if (eval(YTPlayer.opt.stopMovieOnBlur)) {
                    if (!document.hasFocus()) {
                        if (YTPlayer.state == 1) {
                            YTPlayer.hasFocus = false;
                            $YTPlayer.YTPPause();
                        }
                    } else if (document.hasFocus() && !YTPlayer.hasFocus && !(YTPlayer.state == -1 || YTPlayer.state == 0)) {
                        YTPlayer.hasFocus = true;
                        $YTPlayer.YTPPlay();
                    }
                }

                if (YTPlayer.controlBar.length && YTPlayer.controlBar.outerWidth() <= 400 && !YTPlayer.isCompact) {
                    YTPlayer.controlBar.addClass("compact");
                    YTPlayer.isCompact = true;
                    if (!YTPlayer.isMute && YTPlayer.volumeBar) YTPlayer.volumeBar.updateSliderVal(YTPlayer.opt.vol);
                } else if (YTPlayer.controlBar.length && YTPlayer.controlBar.outerWidth() > 400 && YTPlayer.isCompact) {
                    YTPlayer.controlBar.removeClass("compact");
                    YTPlayer.isCompact = false;
                    if (!YTPlayer.isMute && YTPlayer.volumeBar) YTPlayer.volumeBar.updateSliderVal(YTPlayer.opt.vol);
                }
                if (YTPlayer.player.getPlayerState() == 1 && (parseFloat(YTPlayer.player.getDuration() - .5) < YTPlayer.player.getCurrentTime() || (stopAt > 0 && parseFloat(YTPlayer.player.getCurrentTime()) > stopAt))) {
                    if (YTPlayer.isEnded) return;
                    YTPlayer.isEnded = true;
                    setTimeout(function () {
                        YTPlayer.isEnded = false
                    }, 1000);

                    if (YTPlayer.isPlayList) {

                        if (!data.loop || (data.loop > 0 && YTPlayer.player.loopTime === data.loop - 1)) {

                            YTPlayer.player.loopTime = undefined;
                            clearInterval(YTPlayer.getState);
                            var YTPEnd = jQuery.Event("YTPEnd");
                            YTPEnd.time = YTPlayer.currentTime;
                            jQuery(YTPlayer).trigger(YTPEnd);
                            //YTPlayer.state = 0;

                            return;
                        }

                    } else if (!data.loop || (data.loop > 0 && YTPlayer.player.loopTime === data.loop - 1)) {

                        YTPlayer.player.loopTime = undefined;
                        YTPlayer.preventTrigger = true;
                        YTPlayer.state = 2;
                        jQuery(YTPlayer).YTPPause();

                        YTPlayer.wrapper.CSSAnimate({
                            opacity: 0
                        }, YTPlayer.opt.fadeOnStartTime, function () {

                            if (YTPlayer.controlBar.length)
                                YTPlayer.controlBar.find(".mb_YTPPlaypause").html(jQuery.mbYTPlayer.controls.play);

                            var YTPEnd = jQuery.Event("YTPEnd");
                            YTPEnd.time = YTPlayer.currentTime;
                            jQuery(YTPlayer).trigger(YTPEnd);

                            YTPlayer.player.seekTo(startAt, true);
                            if (!YTPlayer.isBackground) {
                                if (YTPlayer.opt.backgroundUrl && YTPlayer.isPlayer) {
                                    YTPlayer.opt.backgroundUrl = YTPlayer.opt.backgroundUrl || YTPlayer.orig_background;
                                    YTPlayer.opt.containment.css({
                                        background: "url(" + YTPlayer.opt.backgroundUrl + ") center center",
                                        backgroundSize: "cover"
                                    });
                                }
                            } else {
                                if (YTPlayer.orig_background)
                                    jQuery(YTPlayer).css("background-image", YTPlayer.orig_background);
                            }
                        });

                        return;

                    }

                    YTPlayer.player.loopTime = YTPlayer.player.loopTime ? ++YTPlayer.player.loopTime : 1;
                    startAt = startAt || 1;
                    YTPlayer.preventTrigger = true;
                    YTPlayer.state = 2;
                    jQuery(YTPlayer).YTPPause();
                    YTPlayer.player.seekTo(startAt, true);
                    $YTPlayer.YTPPlay();


                }
            }, interval);
        },
        /**
         *
         * @returns {string} time
         */
        getTime: function () {
            var YTPlayer = this.get(0);
            return jQuery.mbYTPlayer.formatTime(YTPlayer.currentTime);
        },
        /**
         *
         * @returns {string} total time
         */
        getTotalTime: function () {
            var YTPlayer = this.get(0);
            return jQuery.mbYTPlayer.formatTime(YTPlayer.totalTime);
        },
        /**
         *
         * @param YTPlayer
         */
        checkForStart: function (YTPlayer) {

            var $YTPlayer = jQuery(YTPlayer);

            //Checking if player has been removed from scene
            if (!jQuery.contains(document, YTPlayer)) {
                jQuery(YTPlayer).YTPPlayerDestroy();
                return
            }

            YTPlayer.preventTrigger = true;
            YTPlayer.state = 2;
            jQuery(YTPlayer).YTPPause();

            jQuery(YTPlayer).muteYTPVolume();
            jQuery("#controlBar_" + YTPlayer.id).remove();

            YTPlayer.controlBar = false;

            if (YTPlayer.opt.showControls)
                jQuery.mbYTPlayer.buildControls(YTPlayer);

            if (YTPlayer.opt.addRaster) {

                var classN = YTPlayer.opt.addRaster == "dot" ? "raster-dot" : "raster";
                YTPlayer.overlay.addClass(YTPlayer.isRetina ? classN + " retina" : classN);

            } else {

                YTPlayer.overlay.removeClass(function (index, classNames) {
                    // change the list into an array
                    var current_classes = classNames.split(" "),
                        // array of classes which are to be removed
                        classes_to_remove = [];
                    jQuery.each(current_classes, function (index, class_name) {
                        // if the classname begins with bg add it to the classes_to_remove array
                        if (/raster.*/.test(class_name)) {
                            classes_to_remove.push(class_name);
                        }
                    });
                    classes_to_remove.push("retina");
                    // turn the array back into a string
                    return classes_to_remove.join(" ");
                })

            }

            var startAt = YTPlayer.opt.startAt ? YTPlayer.start_from_last ? YTPlayer.start_from_last : YTPlayer.opt.startAt : 1;
            YTPlayer.start_from_last = null;

            YTPlayer.player.playVideo();
            YTPlayer.player.seekTo(startAt, true);

            clearInterval(YTPlayer.checkForStartAt);
            YTPlayer.checkForStartAt = setInterval(function () {

                jQuery(YTPlayer).YTPMute();

                var canPlayVideo = YTPlayer.player.getVideoLoadedFraction() >= startAt / YTPlayer.player.getDuration();

                if (YTPlayer.player.getDuration() > 0 && YTPlayer.player.getCurrentTime() >= startAt && canPlayVideo) {

                    clearInterval(YTPlayer.checkForStartAt);

                    if (typeof YTPlayer.opt.onReady == "function")
                        YTPlayer.opt.onReady(YTPlayer);

                    YTPlayer.isReady = true;

                    var YTPready = jQuery.Event("YTPReady");
                    YTPready.time = YTPlayer.currentTime;
                    jQuery(YTPlayer).trigger(YTPready);

                    YTPlayer.preventTrigger = true;
                    YTPlayer.state = 2;
                    jQuery(YTPlayer).YTPPause();

                    if (!YTPlayer.opt.mute)
                        jQuery(YTPlayer).YTPUnmute();
                    YTPlayer.canTrigger = true;

                    if (YTPlayer.opt.autoPlay) {

                        var YTPStart = jQuery.Event("YTPStart");
                        YTPStart.time = YTPlayer.currentTime;
                        jQuery(YTPlayer).trigger(YTPStart);

                        jQuery(YTPlayer.playerEl).CSSAnimate({
                            opacity: 1
                        }, 1000);

                        $YTPlayer.YTPPlay();

                        YTPlayer.wrapper.CSSAnimate({
                            opacity: YTPlayer.isAlone ? 1 : YTPlayer.opt.opacity
                        }, YTPlayer.opt.fadeOnStartTime * 2);

                        /* Fix for Safari freeze */

                        if (jQuery.mbBrowser.os.name == "mac" && jQuery.mbBrowser.safari && jQuery.mbBrowser.versionCompare(jQuery.mbBrowser.fullVersion, "10.1") < 0) { //jQuery.mbBrowser.os.minor_version < 11

                            YTPlayer.safariPlay = setInterval(function () {
                                if (YTPlayer.state != 1)
                                    $YTPlayer.YTPPlay();
                                else
                                    clearInterval(YTPlayer.safariPlay)
                            }, 10)
                        }
                        $YTPlayer.one("YTPReady", function () {
                            $YTPlayer.YTPPlay();
                        });

                    } else {

                        //$YTPlayer.YTPPause();
                        YTPlayer.player.pauseVideo();
                        if (!YTPlayer.isPlayer) {
                            jQuery(YTPlayer.playerEl).CSSAnimate({
                                opacity: 1
                            }, YTPlayer.opt.fadeOnStartTime);

                            YTPlayer.wrapper.CSSAnimate({
                                opacity: YTPlayer.isAlone ? 1 : YTPlayer.opt.opacity
                            }, YTPlayer.opt.fadeOnStartTime);
                        }

                        if (YTPlayer.controlBar.length)
                            YTPlayer.controlBar.find(".mb_YTPPlaypause").html(jQuery.mbYTPlayer.controls.play);
                    }

                    if (YTPlayer.isPlayer && !YTPlayer.opt.autoPlay && (YTPlayer.loading && YTPlayer.loading.length)) {
                        YTPlayer.loading.html("Ready");
                        setTimeout(function () {
                            YTPlayer.loading.fadeOut();
                        }, 100)
                    }

                    if (YTPlayer.controlBar && YTPlayer.controlBar.length)
                        YTPlayer.controlBar.slideDown(1000);

                } else if (jQuery.mbBrowser.os.name == "mac" && jQuery.mbBrowser.safari && jQuery.mbBrowser.fullVersion && jQuery.mbBrowser.versionCompare(jQuery.mbBrowser.fullVersion, "10.1") < 0) { //jQuery.mbBrowser.os.minor_version < 11
                    YTPlayer.player.playVideo();
                    if (startAt >= 0)
                        YTPlayer.player.seekTo(startAt, true);
                }

            }, 10);

        },
        /**
         *
         * @param anchor
         */
        setAnchor: function (anchor) {
            var $YTplayer = this;
            $YTplayer.optimizeDisplay(anchor);
        },
        /**
         *
         * @param anchor
         */
        getAnchor: function () {
            var YTPlayer = this.get(0);
            return YTPlayer.opt.anchor;
        },
        /**
         *
         * @param s
         * @returns {string}
         */
        formatTime: function (s) {
            var min = Math.floor(s / 60);
            var sec = Math.floor(s - (60 * min));
            return (min <= 9 ? "0" + min : min) + " : " + (sec <= 9 ? "0" + sec : sec);
        }
    };

    /**
     *
     * @param anchor
     * can be center, top, bottom, right, left; (default is center,center)
     */
    jQuery.fn.optimizeDisplay = function (anchor) {
        var YTPlayer = this.get(0);
        var playerBox = jQuery(YTPlayer.playerEl);
        var vid = {};

        YTPlayer.opt.anchor = anchor || YTPlayer.opt.anchor;

        YTPlayer.opt.anchor = typeof YTPlayer.opt.anchor != "undefined " ? YTPlayer.opt.anchor : "center,center";
        var YTPAlign = YTPlayer.opt.anchor.split(",");

        //data.optimizeDisplay = YTPlayer.isPlayer ? false : data.optimizeDisplay;

        if (YTPlayer.opt.optimizeDisplay) {
            var abundance = YTPlayer.isPlayer ? 0 : 80;
            var win = {};
            var el = YTPlayer.wrapper;

            win.width = el.outerWidth();
            win.height = el.outerHeight() + abundance;

            YTPlayer.opt.ratio = eval(YTPlayer.opt.ratio);

            vid.width = win.width;
            //			vid.height = YTPlayer.opt.ratio == "16/9" ? Math.ceil( vid.width * ( 9 / 16 ) ) : Math.ceil( vid.width * ( 3 / 4 ) );
            vid.height = Math.ceil(vid.width / YTPlayer.opt.ratio);

            vid.marginTop = Math.ceil(-((vid.height - win.height) / 2));
            vid.marginLeft = 0;

            var lowest = vid.height < win.height;

            if (lowest) {

                vid.height = win.height;
                //				vid.width = YTPlayer.opt.ratio == "16/9" ? Math.floor( vid.height * ( 16 / 9 ) ) : Math.floor( vid.height * ( 4 / 3 ) );
                vid.width = Math.ceil(vid.height * YTPlayer.opt.ratio);

                vid.marginTop = 0;
                vid.marginLeft = Math.ceil(-((vid.width - win.width) / 2));

            }

            for (var a in YTPAlign) {

                if (YTPAlign.hasOwnProperty(a)) {

                    var al = YTPAlign[a].replace(/ /g, "");

                    switch (al) {

                        case "top":
                            vid.marginTop = lowest ? -((vid.height - win.height) / 2) : 0;
                            break;

                        case "bottom":
                            vid.marginTop = lowest ? 0 : -(vid.height - (win.height));
                            break;

                        case "left":
                            vid.marginLeft = 0;
                            break;

                        case "right":
                            vid.marginLeft = lowest ? -(vid.width - win.width) : 0;
                            break;

                        default:
                            if (vid.width > win.width)
                                vid.marginLeft = -((vid.width - win.width) / 2);
                            break;
                    }

                }

            }

        } else {
            vid.width = "100%";
            vid.height = "100%";
            vid.marginTop = 0;
            vid.marginLeft = 0;
        }

        playerBox.css({
            width: vid.width,
            height: vid.height,
            marginTop: vid.marginTop,
            marginLeft: vid.marginLeft,
            maxWidth: "initial"
        });

    };
    /**
     *
     * @param arr
     * @returns {Array|string|Blob|*}
     *
     */
    jQuery.shuffle = function (arr) {
        var newArray = arr.slice();
        var len = newArray.length;
        var i = len;
        while (i--) {
            var p = parseInt(Math.random() * len);
            var t = newArray[i];
            newArray[i] = newArray[p];
            newArray[p] = t;
        }
        return newArray;
    };

    jQuery.fn.unselectable = function () {
        return this.each(function () {
            jQuery(this).css({
                "-moz-user-select": "none",
                "-webkit-user-select": "none",
                "user-select": "none"
            }).attr("unselectable", "on");
        });
    };

    /* Exposed public method */
    jQuery.fn.YTPlayer = jQuery.mbYTPlayer.buildPlayer;
    jQuery.fn.YTPGetPlayer = jQuery.mbYTPlayer.getPlayer;
    jQuery.fn.YTPGetVideoID = jQuery.mbYTPlayer.getVideoID;
    jQuery.fn.YTPChangeMovie = jQuery.mbYTPlayer.changeMovie;
    jQuery.fn.YTPPlayerDestroy = jQuery.mbYTPlayer.playerDestroy;

    jQuery.fn.YTPPlay = jQuery.mbYTPlayer.play;
    jQuery.fn.YTPTogglePlay = jQuery.mbYTPlayer.togglePlay;
    jQuery.fn.YTPStop = jQuery.mbYTPlayer.stop;
    jQuery.fn.YTPPause = jQuery.mbYTPlayer.pause;
    jQuery.fn.YTPSeekTo = jQuery.mbYTPlayer.seekTo;

    jQuery.fn.YTPlaylist = jQuery.mbYTPlayer.playlist;
    jQuery.fn.YTPPlayNext = jQuery.mbYTPlayer.playNext;
    jQuery.fn.YTPPlayPrev = jQuery.mbYTPlayer.playPrev;
    jQuery.fn.YTPPlayIndex = jQuery.mbYTPlayer.playIndex;

    jQuery.fn.YTPMute = jQuery.mbYTPlayer.mute;
    jQuery.fn.YTPUnmute = jQuery.mbYTPlayer.unmute;
    jQuery.fn.YTPToggleVolume = jQuery.mbYTPlayer.toggleVolume;
    jQuery.fn.YTPSetVolume = jQuery.mbYTPlayer.setVolume;

    jQuery.fn.YTPGetVideoData = jQuery.mbYTPlayer.getVideoData;
    jQuery.fn.YTPFullscreen = jQuery.mbYTPlayer.fullscreen;
    jQuery.fn.YTPToggleLoops = jQuery.mbYTPlayer.toggleLoops;
    jQuery.fn.YTPSetVideoQuality = jQuery.mbYTPlayer.setVideoQuality;
    jQuery.fn.YTPManageProgress = jQuery.mbYTPlayer.manageProgress;

    jQuery.fn.YTPApplyFilter = jQuery.mbYTPlayer.applyFilter;
    jQuery.fn.YTPApplyFilters = jQuery.mbYTPlayer.applyFilters;
    jQuery.fn.YTPToggleFilter = jQuery.mbYTPlayer.toggleFilter;
    jQuery.fn.YTPToggleFilters = jQuery.mbYTPlayer.toggleFilters;
    jQuery.fn.YTPRemoveFilter = jQuery.mbYTPlayer.removeFilter;
    jQuery.fn.YTPDisableFilters = jQuery.mbYTPlayer.disableFilters;
    jQuery.fn.YTPEnableFilters = jQuery.mbYTPlayer.enableFilters;
    jQuery.fn.YTPGetFilters = jQuery.mbYTPlayer.getFilters;

    jQuery.fn.YTPGetTime = jQuery.mbYTPlayer.getTime;
    jQuery.fn.YTPGetTotalTime = jQuery.mbYTPlayer.getTotalTime;

    jQuery.fn.YTPAddMask = jQuery.mbYTPlayer.addMask;
    jQuery.fn.YTPRemoveMask = jQuery.mbYTPlayer.removeMask;
    jQuery.fn.YTPToggleMask = jQuery.mbYTPlayer.toggleMask;

    jQuery.fn.YTPSetAnchor = jQuery.mbYTPlayer.setAnchor;
    jQuery.fn.YTPGetAnchor = jQuery.mbYTPlayer.getAnchor;

    /**
     *
     * @deprecated
     * todo: Above methods will be removed with version 3.5.0
     *
     **/
    jQuery.fn.mb_YTPlayer = jQuery.mbYTPlayer.buildPlayer;
    jQuery.fn.playNext = jQuery.mbYTPlayer.playNext;
    jQuery.fn.playPrev = jQuery.mbYTPlayer.playPrev;
    jQuery.fn.changeMovie = jQuery.mbYTPlayer.changeMovie;
    jQuery.fn.getVideoID = jQuery.mbYTPlayer.getVideoID;
    jQuery.fn.getPlayer = jQuery.mbYTPlayer.getPlayer;
    jQuery.fn.playerDestroy = jQuery.mbYTPlayer.playerDestroy;
    jQuery.fn.fullscreen = jQuery.mbYTPlayer.fullscreen;
    jQuery.fn.buildYTPControls = jQuery.mbYTPlayer.buildControls;
    jQuery.fn.playYTP = jQuery.mbYTPlayer.play;
    jQuery.fn.toggleLoops = jQuery.mbYTPlayer.toggleLoops;
    jQuery.fn.stopYTP = jQuery.mbYTPlayer.stop;
    jQuery.fn.pauseYTP = jQuery.mbYTPlayer.pause;
    jQuery.fn.seekToYTP = jQuery.mbYTPlayer.seekTo;
    jQuery.fn.muteYTPVolume = jQuery.mbYTPlayer.mute;
    jQuery.fn.unmuteYTPVolume = jQuery.mbYTPlayer.unmute;
    jQuery.fn.setYTPVolume = jQuery.mbYTPlayer.setVolume;
    jQuery.fn.setVideoQuality = jQuery.mbYTPlayer.setVideoQuality;
    jQuery.fn.manageYTPProgress = jQuery.mbYTPlayer.manageProgress;
    jQuery.fn.YTPGetDataFromFeed = jQuery.mbYTPlayer.getVideoData;


})(jQuery, ytp);

