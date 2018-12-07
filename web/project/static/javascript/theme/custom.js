(function ($) {
    "use strict";

    var THEMEMASCOT = {};

    /* ---------------------------------------------------------------------- */
    /* -------------------------- Declare Variables ------------------------- */
    /* ---------------------------------------------------------------------- */
    var $document = $(document);
    var $document_body = $(document.body);
    var $window = $(window);
    var $html = $('html');
    var $body = $('body');
    var $wrapper = $('#wrapper');
    var $header = $('#header');
    var $footer = $('#footer');
    var $sections = $('section');
    var $portfolio_gallery = $(".portfolio-gallery");
    var $portfolio_filter = $(".portfolio-filter a");
    var $portfolio_filter_first_child = $(".portfolio-filter a:eq(0)");
    var $portfolio_flex_slider = $(".portfolio-slider");

    THEMEMASCOT.isMobile = {
        Android: function () {
            return navigator.userAgent.match(/Android/i);
        },
        BlackBerry: function () {
            return navigator.userAgent.match(/BlackBerry/i);
        },
        iOS: function () {
            return navigator.userAgent.match(/iPhone|iPad|iPod/i);
        },
        Opera: function () {
            return navigator.userAgent.match(/Opera Mini/i);
        },
        Windows: function () {
            return navigator.userAgent.match(/IEMobile/i);
        },
        any: function () {
            return (THEMEMASCOT.isMobile.Android()
                || THEMEMASCOT.isMobile.BlackBerry()
                || THEMEMASCOT.isMobile.iOS()
                || THEMEMASCOT.isMobile.Opera() || THEMEMASCOT.isMobile
                    .Windows());
        }
    };

    THEMEMASCOT.isRTL = {
        check: function () {
            if ($("html").attr("dir") == "rtl") {
                return true;
            } else {
                return false;
            }
        }
    };

    THEMEMASCOT.urlParameter = {
        get: function (sParam) {
            var sPageURL = decodeURIComponent(window.location.search
                .substring(1)), sURLVariables = sPageURL.split('&'), sParameterName, i;

            for (i = 0; i < sURLVariables.length; i++) {
                sParameterName = sURLVariables[i].split('=');

                if (sParameterName[0] === sParam) {
                    return sParameterName[1] === undefined ? true
                        : sParameterName[1];
                }
            }
        }
    };

    THEMEMASCOT.initialize = {

        init: function () {
            // THEMEMASCOT.initialize.TM_datePicker();
            // THEMEMASCOT.initialize.TM_demoSwitcher();
            THEMEMASCOT.initialize.TM_platformDetect();
            THEMEMASCOT.initialize.TM_customDataAttributes();
            //THEMEMASCOT.initialize.TM_parallaxBgInit();
            THEMEMASCOT.initialize.TM_resizeFullscreen();
            THEMEMASCOT.initialize.TM_magnificPopup_lightbox();
            THEMEMASCOT.initialize.TM_prettyPhoto_lightbox();
            THEMEMASCOT.initialize.TM_nivolightbox();
            THEMEMASCOT.initialize.TM_wow();
            // THEMEMASCOT.initialize.TM_fitVids();
            THEMEMASCOT.initialize.TM_YTPlayer();
            THEMEMASCOT.initialize.TM_equalHeightDivs();
        },

        /* ---------------------------------------------------------------------- */
        /* ------------------------------ Date Picker -------------------------- */
        /* ---------------------------------------------------------------------- */
        TM_datePicker: function () {
            $(".date-picker").datepicker();
        },

        /* ---------------------------------------------------------------------- */
        /* ------------------------------ Demo Switcher ------------------------ */
        /* ---------------------------------------------------------------------- */
        TM_demoSwitcher: function () {
            var showSwitcher = true;
            if (showSwitcher) {
                $.ajax({
                    url: "color-switcher/style-switcher.html",
                    success: function (data) {
                        $('body').append(data);
                    },
                    dataType: 'html'
                });
            }
        },

        /* ---------------------------------------------------------------------- */
        /* ------------------------------ preloader ---------------------------- */
        /* ---------------------------------------------------------------------- */
        TM_preLoaderClickDisable: function () {
            var $preloader = $('#preloader');
            $preloader.children('#disable-preloader').on('click', function (e) {
                $preloader.fadeOut();
                return false;
            });
        },

        TM_preLoaderOnLoad: function () {
            var $preloader = $('#preloader');
            $preloader.delay(200).fadeOut('slow');
        },

        /* ---------------------------------------------------------------------- */
        /* ------------------------------- Platform detect --------------------- */
        /* ---------------------------------------------------------------------- */
        TM_platformDetect: function () {
            if (THEMEMASCOT.isMobile.any()) {
                $html.addClass("mobile");
            } else {
                $html.addClass("no-mobile");
            }
        },

        /* ---------------------------------------------------------------------- */
        /* ------------------------------ Hash Forwarding ---------------------- */
        /* ---------------------------------------------------------------------- */
        TM_hashForwarding: function () {
            if (window.location.hash) {
                var hash_offset = $(window.location.hash).offset().top;
                $("html, body").animate({
                    scrollTop: hash_offset
                });
            }
        },

        /* ---------------------------------------------------------------------- */
        /*
         * ----------------------- Background image, color
         * ----------------------
         */
        /* ---------------------------------------------------------------------- */
        TM_customDataAttributes: function () {
            $('[data-bg-color]').each(
                function () {
                    $(this).css(
                        "cssText",
                        "background: " + $(this).data("bg-color")
                        + " !important;");
                });
            $('[data-bg-img]').each(
                function () {
                    $(this).css('background-image',
                        'url(' + $(this).data("bg-img") + ')');
                });
            $('[data-text-color]').each(function () {
                $(this).css('color', $(this).data("text-color"));
            });
            $('[data-font-size]').each(function () {
                $(this).css('font-size', $(this).data("font-size"));
            });
            $('[data-height]').each(function () {
                $(this).css('height', $(this).data("height"));
            });
            $('[data-border]').each(function () {
                $(this).css('border', $(this).data("border"));
            });
            $('[data-margin-top]').each(function () {
                $(this).css('margin-top', $(this).data("margin-top"));
            });
            $('[data-margin-right]').each(function () {
                $(this).css('margin-right', $(this).data("margin-right"));
            });
            $('[data-margin-bottom]').each(function () {
                $(this).css('margin-bottom', $(this).data("margin-bottom"));
            });
            $('[data-margin-left]').each(function () {
                $(this).css('margin-left', $(this).data("margin-left"));
            });
        },

        /* ---------------------------------------------------------------------- */
        /*
         * -------------------------- Background Parallax
         * -----------------------
         */
        /* ---------------------------------------------------------------------- */
        // TM_parallaxBgInit : function() {
        // 	if (!THEMEMASCOT.isMobile.any()) {
        // 		$.stellar({
        // 			horizontalScrolling : false,
        // 			responsive : true,
        // 		});
        // 	} else {
        // 		$('.parallax').addClass("mobile-parallax");
        // 	}
        // },

        /* ---------------------------------------------------------------------- */
        /*
         * --------------------------- Home Resize Fullscreen
         * -------------------
         */
        /* ---------------------------------------------------------------------- */
        TM_resizeFullscreen: function () {
            var windowHeight = $window.height();
            $('.fullscreen, .revslider-fullscreen').height(windowHeight);
        },

        /* ---------------------------------------------------------------------- */
        /*
         * ----------------------------- Magnific Popup
         * -------------------------
         */
        /* ---------------------------------------------------------------------- */
        TM_magnificPopup_lightbox: function () {

            $('.image-popup-lightbox').magnificPopup({
                type: 'image',
                closeOnContentClick: true,
                closeBtnInside: false,
                fixedContentPos: true,
                mainClass: 'mfp-no-margins mfp-fade', // class to remove
                // default margin from
                // left and right side
                image: {
                    verticalFit: true
                }
            });

            $('.image-popup-vertical-fit').magnificPopup({
                type: 'image',
                closeOnContentClick: true,
                mainClass: 'mfp-img-mobile',
                image: {
                    verticalFit: true
                }
            });

            $('.image-popup-fit-width').magnificPopup({
                type: 'image',
                closeOnContentClick: true,
                image: {
                    verticalFit: false
                }
            });

            $('.image-popup-no-margins').magnificPopup({
                type: 'image',
                closeOnContentClick: true,
                closeBtnInside: false,
                fixedContentPos: true,
                mainClass: 'mfp-no-margins mfp-with-zoom', // class to remove
                // default margin
                // from left and
                // right side
                image: {
                    verticalFit: true
                },
                zoom: {
                    enabled: true,
                    duration: 300
                    // don't foget to change the duration also in CSS
                }
            });

            $('.popup-gallery')
                .magnificPopup(
                    {
                        delegate: 'a',
                        type: 'image',
                        tLoading: 'Loading image #%curr%...',
                        mainClass: 'mfp-img-mobile',
                        gallery: {
                            enabled: true,
                            navigateByImgClick: true,
                            preload: [0, 1]
                            // Will preload 0 - before current, and 1 after
                            // the current image
                        },
                        image: {
                            tError: '<a href="%url%">The image #%curr%</a> could not be loaded.',
                            titleSrc: function (item) {
                                return item.el.attr('title')
                                    + '<small>by Marsel Van Oosten</small>';
                            }
                        }
                    });

            $('.zoom-gallery')
                .magnificPopup(
                    {
                        delegate: 'a',
                        type: 'image',
                        closeOnContentClick: false,
                        closeBtnInside: false,
                        mainClass: 'mfp-with-zoom mfp-img-mobile',
                        image: {
                            verticalFit: true,
                            titleSrc: function (item) {
                                return item.el.attr('title')
                                    + ' &middot; <a class="image-source-link" href="'
                                    + item.el.attr('data-source')
                                    + '" target="_blank">image source</a>';
                            }
                        },
                        gallery: {
                            enabled: true
                        },
                        zoom: {
                            enabled: true,
                            duration: 300, // don't foget to change the
                            // duration also in CSS
                            opener: function (element) {
                                return element.find('img');
                            }
                        }

                    });

            $('.popup-youtube, .popup-vimeo, .popup-gmaps').magnificPopup({
                disableOn: 700,
                type: 'iframe',
                mainClass: 'mfp-fade',
                removalDelay: 160,
                preloader: false,

                fixedContentPos: false
            });

            $('.popup-with-zoom-anim').magnificPopup({
                type: 'inline',

                fixedContentPos: false,
                fixedBgPos: true,

                overflowY: 'auto',

                closeBtnInside: true,
                preloader: false,

                midClick: true,
                removalDelay: 300,
                mainClass: 'my-mfp-zoom-in'
            });

            $('.popup-with-move-anim').magnificPopup({
                type: 'inline',

                fixedContentPos: false,
                fixedBgPos: true,

                overflowY: 'auto',

                closeBtnInside: true,
                preloader: false,

                midClick: true,
                removalDelay: 300,
                mainClass: 'my-mfp-slide-bottom'
            });

            $('.form-ajax-load').magnificPopup({
                type: 'ajax'
            });

            $('.popup-with-form').magnificPopup({
                type: 'inline',
                preloader: false,
                focus: '#name',

                mainClass: 'mfp-no-margins mfp-fade',
                closeBtnInside: false,
                fixedContentPos: true,

                // When elemened is focused, some mobile browsers in some cases
                // zoom in
                // It looks not nice, so we disable it:
                callbacks: {
                    beforeOpen: function () {
                        if ($(window).width() < 700) {
                            this.st.focus = false;
                        } else {
                            this.st.focus = '#name';
                        }
                    }
                }
            });

            var $mfpLightboxAjax = $('[data-lightbox="ajax"]');
            if ($mfpLightboxAjax.length > 0) {
                $mfpLightboxAjax.magnificPopup({
                    type: 'ajax',
                    closeBtnInside: false,
                    callbacks: {
                        ajaxContentAdded: function (mfpResponse) {
                        },
                        open: function () {
                        },
                        close: function () {
                        }
                    }
                });
            }

            // lightbox image
            var $mfpLightboxImage = $('[data-lightbox="image"]');
            if ($mfpLightboxImage.length > 0) {
                $mfpLightboxImage.magnificPopup({
                    type: 'image',
                    closeOnContentClick: true,
                    closeBtnInside: false,
                    fixedContentPos: true,
                    mainClass: 'mfp-no-margins mfp-with-zoom', // class to
                    // remove
                    // default
                    // margin from
                    // left and
                    // right side
                    image: {
                        verticalFit: true
                    }
                });
            }

            // lightbox gallery
            var $mfpLightboxGallery = $('[data-lightbox="gallery"]');
            if ($mfpLightboxGallery.length > 0) {
                $mfpLightboxGallery.each(function () {
                    var element = $(this);
                    element.magnificPopup({
                        delegate: 'a[data-lightbox="gallery-item"]',
                        type: 'image',
                        closeOnContentClick: true,
                        closeBtnInside: false,
                        fixedContentPos: true,
                        mainClass: 'mfp-no-margins mfp-with-zoom', // class to
                        // remove
                        // default
                        // margin
                        // from left
                        // and right
                        // side
                        image: {
                            verticalFit: true
                        },
                        gallery: {
                            enabled: true,
                            navigateByImgClick: true,
                            preload: [0, 1]
                            // Will preload 0 - before current, and 1 after the
                            // current image
                        },
                        zoom: {
                            enabled: true,
                            duration: 300, // don't foget to change the
                            // duration also in CSS
                            opener: function (element) {
                                return element.find('img');
                            }
                        }

                    });
                });
            }

            // lightbox iframe
            var $mfpLightboxIframe = $('[data-lightbox="iframe"]');
            if ($mfpLightboxIframe.length > 0) {
                $mfpLightboxIframe.magnificPopup({
                    disableOn: 600,
                    type: 'iframe',
                    removalDelay: 160,
                    preloader: false,
                    fixedContentPos: false
                });
            }

            // lightbox inline
            var $mfpLightboxInline = $('[data-lightbox="inline"]');
            if ($mfpLightboxInline.length > 0) {
                $mfpLightboxInline.magnificPopup({
                    type: 'inline',
                    mainClass: 'mfp-no-margins mfp-zoom-in',
                    closeBtnInside: false,
                    fixedContentPos: true
                });
            }
        },

        /* ---------------------------------------------------------------------- */
        /*
         * ----------------------------- lightbox popup
         * -------------------------
         */
        /* ---------------------------------------------------------------------- */
        TM_prettyPhoto_lightbox: function () {
            // prettyPhoto lightbox
            $("a[data-rel^='prettyPhoto']").prettyPhoto({
                hook: 'data-rel',
                animation_speed: 'normal',
                theme: 'dark_square',
                slideshow: 3000,
                autoplay_slideshow: false,
                social_tools: false
            });
        },

        /* ---------------------------------------------------------------------- */
        /*
         * ------------------------------ Nivo Lightbox
         * -------------------------
         */
        /* ---------------------------------------------------------------------- */
        TM_nivolightbox: function () {
            $('a[data-lightbox-gallery]').nivoLightbox({
                effect: 'fadeScale'
            });
        },

        /* ---------------------------------------------------------------------- */
        /* ---------------------------- Wow initialize ------------------------- */
        /* ---------------------------------------------------------------------- */
        TM_wow: function () {
            var wow = new WOW({
                mobile: false
                // trigger animations on mobile devices (default is true)
            });
            wow.init();
        },

        /* ---------------------------------------------------------------------- */
        /*
         * ----------------------------- Fit Vids
         * -------------------------------
         */
        /* ---------------------------------------------------------------------- */
        TM_fitVids: function () {
            $body.fitVids();
        },

        /* ---------------------------------------------------------------------- */
        /*
         * ----------------------------- YT Player for Video
         * --------------------
         */
        /* ---------------------------------------------------------------------- */
        TM_YTPlayer: function () {
            $(".player").mb_YTPlayer();
        },

        /* ---------------------------------------------------------------------- */
        /*
         * ---------------------------- equalHeights
         * ----------------------------
         */
        /* ---------------------------------------------------------------------- */
        TM_equalHeightDivs: function () {
            /* equal heigh */
            var $equal_height = $('.equal-height');
            $equal_height.children('div').css('min-height', 'auto');
            $equal_height.equalHeights();

            /* equal heigh inner div */
            var $equal_height_inner = $('.equal-height-inner');
            $equal_height_inner.children('div').css('min-height', 'auto');
            $equal_height_inner.children('div').children('div').css(
                'min-height', 'auto');
            $equal_height_inner.equalHeights();
            $equal_height_inner.children('div').each(
                function () {
                    $(this).children('div').css('min-height',
                        $(this).css('min-height'));
                });

            /* pricing-table equal heigh */
            var $equal_height_pricing_table = $('.equal-height-pricing-table');
            $equal_height_pricing_table.children('div').css('min-height',
                'auto');
            $equal_height_pricing_table.children('div').children('div').css(
                'min-height', 'auto');
            $equal_height_pricing_table.equalHeights();
            $equal_height_pricing_table.children('div').each(
                function () {
                    $(this).children('div').css('min-height',
                        $(this).css('min-height'));
                });

        }

    };

    THEMEMASCOT.header = {

        init: function () {

            var t = setTimeout(function () {
                //THEMEMASCOT.header.TM_fullscreenMenu();
                THEMEMASCOT.header.TM_sidePanelReveal();
                THEMEMASCOT.header.TM_scroolToTopOnClick();
                //THEMEMASCOT.header.TM_scrollToFixed();
                THEMEMASCOT.header.TM_topnavAnimate();
                THEMEMASCOT.header.TM_scrolltoTarget();
                //THEMEMASCOT.header.TM_menuzord();
                //THEMEMASCOT.header.TM_navLocalScorll();
                //THEMEMASCOT.header.TM_menuCollapseOnClick();
                THEMEMASCOT.header.TM_homeParallaxFadeEffect();
                THEMEMASCOT.header.TM_topsearch_toggle();
            }, 0);

        },

        /* ---------------------------------------------------------------------- */
        /* ------------------------- menufullpage ---------------------------- */
        /* ---------------------------------------------------------------------- */
        TM_fullscreenMenu: function () {
            var $menufullpage = $('.menu-full-page .fullpage-nav-toggle');
            $menufullpage.menufullpage();
        },

        /* ---------------------------------------------------------------------- */
        /*
         * ------------------------- Side Push Panel
         * ----------------------------
         */
        /* ---------------------------------------------------------------------- */
        TM_sidePanelReveal: function () {
            $document_body.on('click', '.side-panel-trigger', function (e) {
                $body.toggleClass("side-panel-open");
                if (THEMEMASCOT.isMobile.any()) {
                    $body.toggleClass("overflow-hidden");
                }
                return false;
            });

            $document_body.on('click', '.has-side-panel .body-overlay',
                function (e) {
                    $body.toggleClass("side-panel-open");
                    return false;
                });

            // sitebar tree
            $document_body.on('click', '.side-panel-nav .nav .tree-toggler',
                function (e) {
                    $(this).parent().children('ul.tree').toggle(300);
                });
        },

        /* ---------------------------------------------------------------------- */
        /* ------------------------------- scrollToTop ------------------------- */
        /* ---------------------------------------------------------------------- */
        TM_scroolToTop: function () {
            if ($window.scrollTop() > 600) {
                $('.scrollToTop').fadeIn();
            } else {
                $('.scrollToTop').fadeOut();
            }
        },

        TM_scroolToTopOnClick: function () {
            $(document.body).on('click', '.scrollToTop', function (e) {
                $('html, body').animate({
                    scrollTop: 0
                }, 800);
                return false;
            });
        },

        /* ---------------------------------------------------------------------------- */
        /*
         * --------------------------- One Page Nav close on click
         * --------------------
         */
        /* ---------------------------------------------------------------------------- */
        TM_menuCollapseOnClick: function () {
            $(document).on('click', '.onepage-nav a', function (e) {
                $('.showhide').trigger('click');
                return false;
            });
        },

        /* ---------------------------------------------------------------------- */
        /*
         * ----------- Active Menu Item on Reaching Different Sections
         * ----------
         */
        /* ---------------------------------------------------------------------- */
        TM_activateMenuItemOnReach: function () {
            var $onepage_nav = $('.onepage-nav');
            var cur_pos = $window.scrollTop() + 2;
            var nav_height = $onepage_nav.outerHeight();
            $sections.each(function () {
                var top = $(this).offset().top - nav_height - 80, bottom = top
                    + $(this).outerHeight();

                if (cur_pos >= top && cur_pos <= bottom) {
                    $onepage_nav.find('a').parent().removeClass('current')
                        .removeClass('active');
                    $sections.removeClass('current').removeClass('active');

                    // $(this).addClass('current').addClass('active');
                    $onepage_nav.find('a[href="#' + $(this).attr('id') + '"]')
                        .parent().addClass('current').addClass('active');
                }
            });
        },

        /* ---------------------------------------------------------------------- */
        /*
         * ------------------- on click scrool to target with smoothness
         * --------
         */
        /* ---------------------------------------------------------------------- */
        TM_scrolltoTarget: function () {
            // jQuery for page scrolling feature - requires jQuery Easing plugin
            $('.smooth-scroll-to-target, .fullscreen-onepage-nav a')
                .on(
                    'click',
                    function (e) {
                        e.preventDefault();

                        var $anchor = $(this);

                        var $hearder_top = $('.header .header-nav');
                        var hearder_top_offset = 0;
                        if ($hearder_top[0]) {
                            hearder_top_offset = $hearder_top
                                .outerHeight(true);
                        } else {
                            hearder_top_offset = 0;
                        }

                        // for vertical nav, offset 0
                        if ($body.hasClass("vertical-nav")) {
                            hearder_top_offset = 0;
                        }

                        var top = $($anchor.attr('href')).offset().top
                            - hearder_top_offset;
                        $('html, body').stop().animate({
                            scrollTop: top
                        }, 1500, 'easeInOutExpo');

                    });
        },

        /* ---------------------------------------------------------------------- */
        /*
         * -------------------------- Scroll navigation
         * -------------------------
         */
        /* ---------------------------------------------------------------------- */
        TM_navLocalScorll: function () {
            var data_offset = -60;
            $("#menuzord .menuzord-menu, #menuzord-right .menuzord-menu")
                .localScroll({
                    target: "body",
                    duration: 800,
                    offset: data_offset,
                    easing: "easeInOutExpo"
                });

            $(
                "#menuzord-side-panel .menuzord-menu, #menuzord-verticalnav .menuzord-menu, #fullpage-nav")
                .localScroll({
                    target: "body",
                    duration: 800,
                    offset: 0,
                    easing: "easeInOutExpo"
                });
        },

        /* ---------------------------------------------------------------------------- */
        /*
         * --------------------------- collapsed menu close on click
         * ------------------
         */
        /* ---------------------------------------------------------------------------- */
        TM_scrollToFixed: function () {
            $('.navbar-scrolltofixed').scrollToFixed();
            $('.scrolltofixed')
                .scrollToFixed(
                    {
                        marginTop: $('.header .header-nav')
                            .outerHeight(true) + 10,
                        limit: function () {
                            var limit = $('#footer').offset().top
                                - $(this).outerHeight(true);
                            return limit;
                        }
                    });
            $('#sidebar')
                .scrollToFixed(
                    {
                        marginTop: $('.header .header-nav')
                            .outerHeight() + 20,
                        limit: function () {
                            var limit = $('#footer').offset().top
                                - $('#sidebar').outerHeight() - 20;
                            return limit;
                        }
                    });
        },

        /* ----------------------------------------------------------------------------- */
        /*
         * --------------------------- Menuzord - Responsive Megamenu
         * ------------------
         */
        /* ----------------------------------------------------------------------------- */
        TM_menuzord: function () {
            $("#menuzord").menuzord({
                align: "left",
                effect: "slide",
                animation: "none",
                indicatorFirstLevel: "<i class='fa fa-angle-down'></i>",
                indicatorSecondLevel: "<i class='fa fa-angle-right'></i>"
            });
            $("#menuzord-right").menuzord({
                align: "right",
                effect: "slide",
                animation: "none",
                indicatorFirstLevel: "<i class='fa fa-angle-down'></i>",
                indicatorSecondLevel: "<i class='fa fa-angle-right'></i>"
            });
            $("#menuzord-side-panel").menuzord({
                align: "right",
                effect: "slide",
                animation: "none",
                indicatorFirstLevel: "",
                indicatorSecondLevel: "<i class='fa fa-angle-right'></i>"
            });

            $("#menuzord-verticalnav").menuzord({
                align: "right",
                effect: "slide",
                animation: "none",
                indicatorFirstLevel: "<i class='fa fa-angle-down'></i>",
                indicatorSecondLevel: "<i class='fa fa-angle-right'></i>"
                /*
                 * indicatorFirstLevel: "<i class='fa fa-angle-right'></i>",
                 * indicatorSecondLevel: "<i class='fa fa-angle-right'></i>"
                 */
            });
        },

        /* ---------------------------------------------------------------------- */
        /*
         * --------------------------- Waypoint Top Nav Sticky
         * ------------------
         */
        /* ---------------------------------------------------------------------- */
        TM_topnavAnimate: function () {
            if ($window.scrollTop() > (50)) {
                $(".navbar-sticky-animated").removeClass("animated-active");
            } else {
                $(".navbar-sticky-animated").addClass("animated-active");
            }

            if ($window.scrollTop() > (50)) {
                $(
                    ".navbar-sticky-animated .header-nav-wrapper .container, .navbar-sticky-animated .header-nav-wrapper .container-fluid")
                    .removeClass("add-padding");
            } else {
                $(
                    ".navbar-sticky-animated .header-nav-wrapper .container, .navbar-sticky-animated .header-nav-wrapper .container-fluid")
                    .addClass("add-padding");
            }
        },

        /* ---------------------------------------------------------------------- */
        /*
         * ---------------- home section on scroll parallax & fade
         * --------------
         */
        /* ---------------------------------------------------------------------- */
        TM_homeParallaxFadeEffect: function () {
            if ($window.width() >= 1200) {
                var scrolled = $window.scrollTop();
                $('.content-fade-effect .home-content .home-text').css(
                    'padding-top', (scrolled * 0.0610) + '%').css(
                    'opacity', 1 - (scrolled * 0.00120));
            }
        },

        /* ---------------------------------------------------------------------- */
        /* --------------------------- Top search toggle ----------------------- */
        /* ---------------------------------------------------------------------- */
        TM_topsearch_toggle: function () {
            $(document.body).on('click', '#top-search-toggle', function (e) {
                e.preventDefault();
                $('.search-form-wrapper.toggle').toggleClass('active');
                return false;
            });
        }

    };

    THEMEMASCOT.widget = {

        init: function () {

            var t = setTimeout(function () {
                THEMEMASCOT.widget.TM_tableScheduleClickToggle();
                THEMEMASCOT.widget.TM_shopClickEvents();
                THEMEMASCOT.widget.TM_fcCalender();
                THEMEMASCOT.widget.TM_verticalTimeline();
                //THEMEMASCOT.widget.TM_verticalMasonryTimeline();
                //THEMEMASCOT.widget.TM_masonryIsotop();
                //THEMEMASCOT.widget.TM_pieChart();
                //THEMEMASCOT.widget.TM_progressBar();
                //THEMEMASCOT.widget.TM_funfact();
                THEMEMASCOT.widget.TM_instagramFeed();
                THEMEMASCOT.widget.TM_jflickrfeed();
                THEMEMASCOT.widget.TM_accordion_toggles();
                THEMEMASCOT.widget.TM_tooltip();
                // THEMEMASCOT.widget.TM_twittie();
                //THEMEMASCOT.widget.TM_countDownTimer();
            }, 0);

        },

        /* ---------------------------------------------------------------------- */
        /*
         * ------------------------------ Shop Plus Minus
         * -----------------------
         */
        /* ---------------------------------------------------------------------- */
        TM_tableScheduleClickToggle: function () {
            $(document)
                .on(
                    'click',
                    '.schedule-tab .cd-timeline-content .timeline-title, #toggle11 .toggle-content',
                    function (e) {
                        var current_item = $(this);
                        current_item.next('p').slideToggle(400);
                        current_item.children('span').children('i')
                            .toggleClass('fa-minus-square-o')
                            .toggleClass('fa-plus-square-o');
                        return false;
                    });

            $(document)
                .on(
                    'click',
                    '.table-schedule .toggle-content, #toggle11 .toggle-content',
                    function (e) {
                        var current_item = $(this);
                        current_item.next('p.session-details')
                            .slideToggle(400);
                        current_item.children('i').toggleClass(
                            'fa-minus-square-o').toggleClass(
                            'fa-plus-square-o');
                        return false;
                    });
        },

        /* ---------------------------------------------------------------------- */
        /*
         * ------------------------------ Shop Plus Minus
         * -----------------------
         */
        /* ---------------------------------------------------------------------- */
        TM_shopClickEvents: function () {
            $(document.body).on(
                'click',
                '.quantity .plus',
                function (e) {
                    var currentVal = parseInt($(this).parent().children(
                        ".qty").val(), 10);
                    if (!isNaN(currentVal)) {
                        $(this).parent().children(".qty").val(
                            currentVal + 1);
                    }
                    return false;
                });

            $(document.body).on(
                'click',
                '.quantity .minus',
                function (e) {
                    var currentVal = parseInt($(this).parent().children(
                        ".qty").val(), 10);
                    if (!isNaN(currentVal) && currentVal > 0) {
                        $(this).parent().children(".qty").val(
                            currentVal - 1);
                    }
                    return false;
                });

            $(document.body).on('click', '#checkbox-ship-to-different-address',
                function (e) {
                    $("#checkout-shipping-address").toggle(this.checked);
                });
        },

        /* ---------------------------------------------------------------------- */
        /*
         * ------------------------------ Event Calendar
         * ------------------------
         */
        /* ---------------------------------------------------------------------- */
        TM_fcCalender: function () {
            if (typeof calendarEvents !== "undefined") {
                $('#full-event-calendar').fullCalendar(
                    {
                        header: {
                            left: 'prev,next today',
                            center: 'title',
                            right: 'month,agendaWeek,agendaDay'
                        },
                        defaultDate: '2016-01-12',
                        selectable: true,
                        selectHelper: true,
                        select: function (start, end) {
                            var title = prompt('Event Title:');
                            var eventData;
                            if (title) {
                                eventData = {
                                    title: title,
                                    start: start,
                                    end: end
                                };
                                $('#calendar').fullCalendar('renderEvent',
                                    eventData, true); // stick? = true
                            }
                            $('#calendar').fullCalendar('unselect');
                        },
                        editable: true,
                        eventLimit: true, // allow "more" link when too
                        // many events
                        events: calendarEvents
                    });
            }
        },

        /* ---------------------------------------------------------------------- */
        /*
         * ------------------------------ Timeline Block
         * ------------------------
         */
        /* ---------------------------------------------------------------------- */
        TM_verticalTimeline: function () {
            var timelineBlocks = $('.cd-timeline-block'), offset = 0.8;

            // hide timeline blocks which are outside the viewport
            hideBlocks(timelineBlocks, offset);

            // on scolling, show/animate timeline blocks when enter the viewport
            $(window).on('scroll', function () {
                (!window.requestAnimationFrame) ? setTimeout(function () {
                    showBlocks(timelineBlocks, offset);
                }, 100) : window.requestAnimationFrame(function () {
                    showBlocks(timelineBlocks, offset);
                });
            });

            function hideBlocks(blocks, offset) {
                blocks.each(function () {
                    ($(this).offset().top > $(window).scrollTop()
                        + $(window).height() * offset)
                    && $(this).find(
                        '.cd-timeline-img, .cd-timeline-content')
                        .addClass('is-hidden');
                });
            }

            function showBlocks(blocks, offset) {
                blocks.each(function () {
                    ($(this).offset().top <= $(window).scrollTop()
                        + $(window).height() * offset && $(this).find(
                            '.cd-timeline-img').hasClass('is-hidden'))
                    && $(this).find(
                        '.cd-timeline-img, .cd-timeline-content')
                        .removeClass('is-hidden').addClass(
                            'bounce-in');
                });
            }
        },

        /* ---------------------------------------------------------------------- */
        /*
         * ----------------------- Vertical Masonry Timeline
         * --------------------
         */
        /* ---------------------------------------------------------------------- */
        TM_verticalMasonryTimeline: function () {
            var $masonry_timeline = $('.vertical-masonry-timeline');
            $masonry_timeline.isotope({
                itemSelector: '.each-masonry-item',
                sortBy: 'original-order',
                layoutMode: 'masonry',
                resizable: false
            });

            // =====> Timeline Positions
            function timeline_on_left_and_right() {
                $masonry_timeline.children('.each-masonry-item').each(
                    function (index, element) {
                        var last_child = $(this);
                        var prev_last = $(this).prev();
                        var last_child_offset = parseInt(last_child
                            .css('top'), 10);
                        var prev_last_offset = parseInt(prev_last
                            .css('top'), 10);
                        var offset_icon = last_child_offset
                            - prev_last_offset;

                        var go_top_to = 0;
                        if (offset_icon) {
                            if (offset_icon <= 87) {
                                go_top_to = 87 - offset_icon;
                                last_child.find('.timeline-post-format')
                                    .animate({
                                        top: go_top_to
                                    }, 300);
                            }
                        }

                        if ($(this).position().left === 0) {
                            $(this).removeClass('item-right');
                            $(this).addClass('item-left');
                        } else {
                            $(this).removeClass('item-left');
                            $(this).addClass('item-right');
                        }
                    });
            }

            timeline_on_left_and_right();

            $(window).resize(function () {
                timeline_on_left_and_right();
            });
        },

        /* ---------------------------------------------------------------------- */
        /*
         * ----------------------------- Masonry Isotope
         * ------------------------
         */
        /* ---------------------------------------------------------------------- */
        TM_masonryIsotop: function () {
            var isotope_mode;
            if ($portfolio_gallery.hasClass("masonry")) {
                isotope_mode = "masonry";
            } else {
                isotope_mode = "fitRows";
            }

            // isotope firsttime loading
            $portfolio_gallery.imagesLoaded(function () {
                $portfolio_gallery.isotope({
                    itemSelector: '.portfolio-item',
                    layoutMode: isotope_mode,
                    filter: "*"
                });
            });

            // isotope filter
            $portfolio_filter.click(function () {
                $portfolio_filter.removeClass("active");
                $(this).addClass("active");
                var fselector = $(this).data('filter');

                $portfolio_gallery.isotope({
                    itemSelector: '.portfolio-item',
                    layoutMode: isotope_mode,
                    filter: fselector
                });
                return false;
            });

            THEMEMASCOT.slider.TM_flexslider();

        },

        TM_portfolioFlexSliderGalleryPopUpInit: function () {
            var $flexSliders = $portfolio_gallery.find('.slides');
            $flexSliders.each(function () {
                var _items = $(this).find("li > a");
                var items = [];
                for (var i = 0; i < _items.length; i++) {
                    items.push({
                        src: $(_items[i]).attr("href"),
                        title: $(_items[i]).attr("title")
                    });
                }
                $(this).parent().parent().parent().find(".icons-holder")
                    .magnificPopup({
                        items: items,
                        type: 'image',
                        gallery: {
                            enabled: true
                        }
                    });
            });
        },

        TM_isotopeGridRearrange: function () {
            var isotope_mode;
            if ($portfolio_gallery.hasClass("masonry")) {
                isotope_mode = "masonry";
            } else {
                isotope_mode = "fitRows";
            }
            $portfolio_gallery.isotope({
                itemSelector: '.portfolio-item',
                layoutMode: isotope_mode
            });
        },

        TM_isotopeGridShuffle: function () {
            $portfolio_gallery.isotope('shuffle');
        },

        /* ---------------------------------------------------------------------- */
        /*
         * ----------------------------- CountDown
         * ------------------------------
         */
        /* ---------------------------------------------------------------------- */
        TM_countDownTimer: function () {
            var $clock = $('#clock');
            var endingdate = $clock.data("endingdate");
            $clock.countdown(endingdate, function (event) {
                var countdown_text = '' + '<ul class="countdown-timer">'
                    + '<li>%D <span>Days</span></li>'
                    + '<li>%H <span>Hours</span></li>'
                    + '<li>%M <span>Minutes</span></li>'
                    + '<li>%S <span>Seconds</span></li>' + '</ul>';
                $(this).html(event.strftime(countdown_text));
            });
        },

        /* ---------------------------------------------------------------------- */
        /*
         * ----------------------- pie chart / circle skill bar
         * -----------------
         */
        /* ---------------------------------------------------------------------- */
        TM_pieChart: function () {
            var $piechart = $('.piechart');
            $piechart.appear();
            $(document.body).on('appear', '.piechart', function () {
                var current_item = $(this);
                if (!current_item.hasClass('appeared')) {
                    var barcolor = current_item.data('barcolor');
                    var trackcolor = current_item.data('trackcolor');
                    var linewidth = current_item.data('linewidth');
                    var boxwidth = current_item.data('boxwidth');
                    current_item.css("width", boxwidth);
                    current_item.easyPieChart({
                        animate: 3000,
                        barColor: barcolor,
                        trackColor: trackcolor,
                        easing: 'easeOutBounce',
                        lineWidth: linewidth,
                        size: boxwidth,
                        lineCap: 'square',
                        scaleColor: false,
                        onStep: function (from, to, percent) {
                            $(this.el).find('span').text(Math.round(percent));
                        }
                    });
                    current_item.addClass('appeared');
                }
            });
        },

        /* ---------------------------------------------------------------------- */
        /*
         * ------------------- progress bar / horizontal skill bar
         * --------------
         */
        /* ---------------------------------------------------------------------- */
        TM_progressBar: function () {
            var $progress_bar = $('.progress-bar');
            $progress_bar.appear();
            $(document.body).on(
                'appear',
                '.progress-bar',
                function () {
                    var current_item = $(this);
                    if (!current_item.hasClass('appeared')) {
                        var percent = current_item.data('percent');
                        var barcolor = current_item.data('barcolor');
                        current_item.append(
                            '<span class="percent">' + percent + '%'
                            + '</span>').css(
                            'background-color', barcolor).css('width',
                            percent + '%').addClass('appeared');
                    }

                });
        },

        /* ---------------------------------------------------------------------- */
        /*
         * ------------------------ Funfact Number Counter
         * ----------------------
         */
        /* ---------------------------------------------------------------------- */
        TM_funfact: function () {
            var $animate_number = $('.animate-number');
            $animate_number.appear();
            $(document.body)
                .on(
                    'appear',
                    '.animate-number',
                    function () {
                        $animate_number
                            .each(function () {
                                var current_item = $(this);
                                if (!current_item
                                        .hasClass('appeared')) {
                                    current_item
                                        .animateNumbers(
                                            current_item
                                                .attr("data-value"),
                                            true,
                                            parseInt(
                                                current_item
                                                    .attr("data-animation-duration"),
                                                10))
                                        .addClass('appeared');
                                }
                            });
                    });
        },

        /* ---------------------------------------------------------------------- */
        /*
         * ----------------------------- Instagram Feed
         * ----------------------------
         */
        /* ---------------------------------------------------------------------- */
        TM_instagramFeed: function () {
            $('.instagram-feed')
                .each(
                    function () {
                        var current_div = $(this);
                        var instagramFeed = new Instafeed(
                            {
                                target: current_div.attr('id'),
                                get: 'user',
                                userId: current_div.data('userid'),
                                accessToken: current_div
                                    .data('accesstoken'),
                                resolution: current_div
                                    .data('resolution'),
                                limit: current_div.data('limit'),
                                template: '<div class="item"><figure><img src="{{image}}" /><a href="{{link}}" class="link-out" target="_blank"><i class="fa fa-link"></i></a></figure></div>',
                                after: function () {
                                }
                            });
                        instagramFeed.run();
                    });

            $('.instagram-feed-carousel')
                .each(
                    function () {
                        var current_div = $(this);
                        var instagramFeed = new Instafeed(
                            {
                                target: current_div.attr('id'),
                                get: 'user',
                                userId: current_div.data('userid'),
                                accessToken: current_div
                                    .data('accesstoken'),
                                resolution: current_div
                                    .data('resolution'),
                                limit: current_div.data('limit'),
                                template: '<div class="item"><figure><img src="{{image}}" /><a href="{{link}}" class="link-out" target="_blank"><i class="fa fa-link"></i></a></figure></div>',
                                after: function () {
                                    current_div.owlCarousel({
                                        rtl: THEMEMASCOT.isRTL
                                            .check(),
                                        autoplay: false,
                                        autoplayTimeout: 4000,
                                        loop: true,
                                        margin: 15,
                                        dots: true,
                                        nav: false,
                                        responsive: {
                                            0: {
                                                items: 2
                                            },
                                            768: {
                                                items: 4
                                            },
                                            1000: {
                                                items: 5
                                            }
                                        }
                                    });
                                }
                            });
                        instagramFeed.run();
                    });
        },

        /* ---------------------------------------------------------------------- */
        /*
         * ---------------------------- Flickr Feed
         * -----------------------------
         */
        /* ---------------------------------------------------------------------- */
        TM_jflickrfeed: function () {
            $(".flickr-widget .flickr-feed, .jflickrfeed")
                .each(
                    function () {
                        var current_div = $(this);
                        current_div
                            .jflickrfeed({
                                limit: 9,
                                qstrings: {
                                    id: current_div.data('userid')
                                },
                                itemTemplate: '<a href="{{link}}" title="{{title}}" target="_blank"><img src="{{image_m}}" alt="{{title}}">  </a>'
                            });
                    });
        },

        /* ---------------------------------------------------------------------- */
        /*
         * ------------------------- accordion & toggles
         * ------------------------
         */
        /* ---------------------------------------------------------------------- */
        TM_accordion_toggles: function () {
            var $panel_group_collapse = $('.panel-group .collapse');
            $panel_group_collapse.on("show.bs.collapse", function (e) {
                $(this).closest(".panel-group").find(
                    "[href='#" + $(this).attr("id") + "']").addClass(
                    "active");
            });
            $panel_group_collapse.on("hide.bs.collapse", function (e) {
                $(this).closest(".panel-group").find(
                    "[href='#" + $(this).attr("id") + "']").removeClass(
                    "active");
            });
        },

        /* ---------------------------------------------------------------------- */
        /* ------------------------------- tooltip ----------------------------- */
        /* ---------------------------------------------------------------------- */
        TM_tooltip: function () {
            $('[data-toggle="tooltip"]').tooltip();
        },

        /* ---------------------------------------------------------------------- */
        /* ---------------------------- Twitter Feed --------------------------- */
        /* ---------------------------------------------------------------------- */
        TM_twittie: function () {
            var $twitter_feed = $('.twitter-feed');
            var $twitter_feed_carousel = $('.twitter-feed-carousel');

            $twitter_feed.twittie({
                username: $twitter_feed.data('username'),
                dateFormat: '%b. %d, %Y',
                template: '{{tweet}} <div class="date">{{date}}</div>',
                count: ($twitter_feed.data("count") === undefined) ? 4
                    : $twitter_feed.data("count"),
                loadingText: 'Loading!'
            });

            $twitter_feed_carousel
                .twittie(
                    {
                        username: $twitter_feed_carousel
                            .data('username'),
                        dateFormat: '%b. %d, %Y',
                        template: '{{tweet}} <div class="date">{{date}}</div>',
                        count: ($twitter_feed_carousel.data("count") === undefined) ? 4
                            : $twitter_feed_carousel.data("count"),
                        loadingText: 'Loading!'
                    }, function () {
                        $twitter_feed_carousel.find('ul').owlCarousel({
                            rtl: THEMEMASCOT.isRTL.check(),
                            autoplay: true,
                            autoplayTimeout: 2000,
                            loop: true,
                            items: 1,
                            dots: true,
                            nav: false
                        });
                    });
        }
    };

    THEMEMASCOT.slider = {

        init: function () {

            var t = setTimeout(function () {
                //THEMEMASCOT.slider.TM_typedAnimation();
                //THEMEMASCOT.slider.TM_flexslider();
                //THEMEMASCOT.slider.TM_owlCarousel();
                //THEMEMASCOT.slider.TM_maximageSlider();
                //THEMEMASCOT.slider.TM_bxslider();
            }, 0);

        },

        /* ---------------------------------------------------------------------- */
        /* -------------------------- Typed Text Carousel ---------------------- */
        /* ---------------------------------------------------------------------- */
        TM_typedAnimation: function () {
            if ($('.typed-text-carousel').length) {
                $('.typed-text-carousel').each(function () {
                    var string_1 = $(this).find('span:first-child').text();
                    var string_2 = $(this).find('span:nth-child(2)').text();
                    var string_3 = $(this).find('span:nth-child(3)').text();
                    var str = '';
                    var $this = $(this);
                    if (!string_2.trim() || !string_3.trim()) {
                        str = [string_1];
                    }
                    if (!string_3.trim() && string_2.length) {
                        str = [string_1, string_2];
                    }
                    if (string_1.length && string_2.length && string_3.length) {
                        str = [string_1, string_2, string_3];
                    }
                    var speed = $(this).data('speed');
                    var back_delay = $(this).data('back_delay');
                    var loop = $(this).data('loop');
                    $(this).typed({
                        strings: str,
                        typeSpeed: speed,
                        backSpeed: 0,
                        backDelay: back_delay,
                        cursorChar: "|",
                        loop: loop,
                        contentType: 'text',
                        loopCount: false
                    });
                });
            }
        },

        /* ---------------------------------------------------------------------- */
        /* -------------------------------- flexslider ------------------------- */
        /* ---------------------------------------------------------------------- */
        TM_flexslider: function () {
            var $each_flex_slider = $('.flexslider-wrapper')
                .find('.flexslider');
            if ($each_flex_slider.length > 0) {
                $each_flex_slider
                    .each(function () {

                        THEMEMASCOT.widget
                            .TM_portfolioFlexSliderGalleryPopUpInit();

                        var $flex_slider = $(this);
                        var data_direction = ($flex_slider
                            .data("direction") === undefined) ? 'horizontal'
                            : $flex_slider.data("direction");
                        var data_controlNav = ($flex_slider
                            .data("controlnav") === undefined) ? false
                            : $flex_slider.data("controlnav");
                        var data_directionnav = ($flex_slider
                            .data("directionnav") === undefined) ? false
                            : $flex_slider.data("directionnav");

                        $flex_slider.flexslider({
                            rtl: THEMEMASCOT.isRTL.check(),
                            selector: ".slides > li",
                            animation: "slide",
                            easing: "swing",
                            direction: data_direction,
                            slideshow: true,
                            slideshowSpeed: 7000,
                            animationSpeed: 600,
                            pauseOnHover: false,
                            controlNav: data_controlNav,
                            directionNav: data_directionnav,
                            start: function (slider) {
                                imagesLoaded($portfolio_gallery,
                                    function () {
                                        setTimeout(function () {
                                            $portfolio_filter_first_child
                                                .trigger("click");
                                        }, 500);
                                    });
                                // var t = setTimeout( function(){
                                // $('#portfolio.portfolio-masonry,#portfolio.portfolio-full,#posts.post-masonry').isotope('layout');
                                // }, 1200 );
                                THEMEMASCOT.initialize
                                    .TM_magnificPopup_lightbox();
                                THEMEMASCOT.initialize
                                    .TM_prettyPhoto_lightbox();
                                THEMEMASCOT.initialize.TM_nivolightbox();
                            },
                            after: function () {
                            }
                        });
                    });
            }
        },

        /* ---------------------------------------------------------------------- */
        /* -------------------------------- Owl Carousel ----------------------- */
        /* ---------------------------------------------------------------------- */
        TM_owlCarousel: function () {
            $(".text-carousel").owlCarousel(
                {
                    rtl: THEMEMASCOT.isRTL.check(),
                    autoplay: true,
                    autoplayTimeout: 2000,
                    loop: true,
                    items: 1,
                    dots: true,
                    nav: false,
                    navText: ['<i class="pe-7s-angle-left"></i>',
                        '<i class="pe-7s-angle-right"></i>']
                });

            $(".image-carousel").owlCarousel(
                {
                    rtl: THEMEMASCOT.isRTL.check(),
                    autoplay: true,
                    autoplayTimeout: 4000,
                    loop: true,
                    items: 1,
                    dots: true,
                    nav: false,
                    navText: ['<i class="pe-7s-angle-left"></i>',
                        '<i class="pe-7s-angle-right"></i>']
                });

            $(".team-carousel-1col").owlCarousel(
                {
                    rtl: THEMEMASCOT.isRTL.check(),
                    autoplay: true,
                    autoplayTimeout: 4000,
                    loop: true,
                    margin: 15,
                    dots: false,
                    nav: true,
                    navText: ['<i class="fa fa-angle-left"></i>',
                        '<i class="fa fa-angle-right"></i>'],
                    responsive: {
                        0: {
                            items: 1,
                            center: false
                        },
                        600: {
                            items: 1,
                            center: false
                        },
                        750: {
                            items: 1,
                            center: false
                        },
                        960: {
                            items: 1
                        },
                        1170: {
                            items: 1
                        },
                        1300: {
                            items: 1
                        }
                    }
                });

            $('.featured-gallery').owlCarousel(
                {
                    autoplay: true,
                    autoplayTimeout: 2000,
                    loop: true,
                    margin: 3,
                    dots: false,
                    nav: true,
                    navText: ['<i class="fa fa-angle-double-left"></i>',
                        '<i class="fa fa-angle-double-right"></i>'],
                    responsive: {
                        0: {
                            items: 1,
                            center: false
                        },
                        600: {
                            items: 2,
                            center: false
                        },
                        960: {
                            items: 3
                        },
                        1170: {
                            items: 4
                        },
                        1300: {
                            items: 4
                        }
                    }
                });

            $('.speakers-carousel').owlCarousel(
                {
                    autoplay: true,
                    autoplayTimeout: 2000,
                    loop: true,
                    margin: 3,
                    dots: false,
                    nav: true,
                    navText: ['<i class="pe-7s-angle-left"></i>',
                        '<i class="pe-7s-angle-right"></i>'],
                    responsive: {
                        0: {
                            items: 1,
                            center: false
                        },
                        600: {
                            items: 2,
                            center: false
                        },
                        960: {
                            items: 3
                        },
                        1170: {
                            items: 4
                        },
                        1300: {
                            items: 4
                        }
                    }
                });

            $("#divSpeakers").owlCarousel({
                rtl: THEMEMASCOT.isRTL.check(),
                autoplay: true,
                autoplayTimeout: 4000,
                loop: true,
                margin: 10,
                dots: true,
                nav: false,
                responsive: {
                    0: {
                        items: 1,
                        center: false
                    },
                    600: {
                        items: 2,
                        center: false
                    },
                    960: {
                        items: 4
                    },
                    1170: {
                        items: 4
                    },
                    1300: {
                        items: 4
                    }
                }
            });

            $(".services-carousel").owlCarousel(
                {
                    rtl: THEMEMASCOT.isRTL.check(),
                    autoplay: true,
                    autoplayTimeout: 4000,
                    loop: true,
                    margin: 15,
                    dots: true,
                    nav: true,
                    navText: ['<i class="fa fa-angle-left"></i>',
                        '<i class="fa fa-angle-right"></i>'],
                    responsive: {
                        0: {
                            items: 1,
                            center: false
                        },
                        600: {
                            items: 1,
                            center: false
                        },
                        960: {
                            items: 2
                        },
                        1170: {
                            items: 3
                        },
                        1300: {
                            items: 3
                        }
                    }
                });

            $(".featured-project-carousel").owlCarousel(
                {
                    rtl: THEMEMASCOT.isRTL.check(),
                    autoplay: false,
                    autoplayTimeout: 4000,
                    loop: true,
                    margin: 15,
                    dots: false,
                    nav: true,
                    navText: ['<i class="fa fa-angle-left"></i>',
                        '<i class="fa fa-angle-right"></i>'],
                    responsive: {
                        0: {
                            items: 1,
                            center: false
                        },
                        600: {
                            items: 1,
                            center: false
                        },
                        960: {
                            items: 1
                        },
                        1170: {
                            items: 1
                        },
                        1300: {
                            items: 1
                        }
                    }
                });

            $(".product-details-carousel").owlCarousel(
                {
                    rtl: THEMEMASCOT.isRTL.check(),
                    autoplay: true,
                    autoplayTimeout: 2000,
                    loop: true,
                    items: 1,
                    dots: false,
                    nav: true,
                    navText: ['<i class="pe-7s-angle-left"></i>',
                        '<i class="pe-7s-angle-right"></i>']
                });

            $(".widget-video-carousel").owlCarousel({
                rtl: THEMEMASCOT.isRTL.check(),
                autoplay: true,
                autoplayTimeout: 4000,
                smartSpeed: 500,
                items: 1,
                loop: true,
                dots: true,
                nav: false
            });

            $(".widget-image-carousel").owlCarousel({
                rtl: THEMEMASCOT.isRTL.check(),
                autoplay: false,
                autoplayTimeout: 2000,
                smartSpeed: 400,
                items: 1,
                loop: true,
                dots: true,
                nav: false
            });

            $(".gallery-list-carosel").owlCarousel(
                {
                    rtl: THEMEMASCOT.isRTL.check(),
                    autoplay: false,
                    autoplayTimeout: 4000,
                    loop: true,
                    margin: 15,
                    dots: false,
                    nav: true,
                    navText: ['<i class="fa fa-angle-left"></i>',
                        '<i class="fa fa-angle-right"></i>'],
                    responsive: {
                        0: {
                            items: 2,
                            center: false
                        },
                        600: {
                            items: 4,
                            center: false
                        },
                        960: {
                            items: 6
                        },
                        1170: {
                            items: 6
                        },
                        1300: {
                            items: 6
                        }
                    }
                });

            $(".testimonial-carousel").owlCarousel({
                rtl: THEMEMASCOT.isRTL.check(),
                autoplay: true,
                autoplayTimeout: 4000,
                loop: true,
                margin: 15,
                dots: true,
                nav: false,
                responsive: {
                    0: {
                        items: 1,
                        center: false
                    },
                    600: {
                        items: 1,
                        center: false
                    },
                    960: {
                        items: 2
                    },
                    1170: {
                        items: 3
                    },
                    1300: {
                        items: 3
                    }
                }
            });

            $(".testimonial-carousel-2col").owlCarousel(
                {
                    rtl: THEMEMASCOT.isRTL.check(),
                    autoplay: false,
                    autoplayTimeout: 4000,
                    loop: true,
                    margin: 15,
                    dots: false,
                    nav: true,
                    navText: ['<i class="fa fa-angle-left"></i>',
                        '<i class="fa fa-angle-right"></i>'],
                    responsive: {
                        0: {
                            items: 1,
                            center: false
                        },
                        600: {
                            items: 1,
                            center: false
                        },
                        960: {
                            items: 1
                        },
                        1170: {
                            items: 2
                        },
                        1300: {
                            items: 2
                        }
                    }
                });

            $(".testimonial-carousel-3col").owlCarousel(
                {
                    rtl: THEMEMASCOT.isRTL.check(),
                    autoplay: false,
                    autoplayTimeout: 4000,
                    loop: true,
                    margin: 15,
                    dots: false,
                    nav: true,
                    navText: ['<i class="fa fa-angle-left"></i>',
                        '<i class="fa fa-angle-right"></i>'],
                    responsive: {
                        0: {
                            items: 1,
                            center: false
                        },
                        600: {
                            items: 1,
                            center: false
                        },
                        960: {
                            items: 2
                        },
                        1170: {
                            items: 3
                        },
                        1300: {
                            items: 3
                        }
                    }
                });

            $('.testimonial-carousel-info')
                .each(
                    function () {
                        var data_dots = ($(this).data("dots") === undefined) ? false
                            : $(this).data("dots");
                        var data_nav = ($(this).data("nav") === undefined) ? false
                            : $(this).data("nav");
                        $(this)
                            .owlCarousel(
                                {
                                    rtl: THEMEMASCOT.isRTL
                                        .check(),
                                    autoplay: true,
                                    autoplayTimeout: 4000,
                                    loop: true,
                                    margin: 15,
                                    dots: false,
                                    nav: true,
                                    navText: [
                                        '<i class="fa fa-angle-left"></i>',
                                        '<i class="fa fa-angle-right"></i>'],
                                    responsive: {
                                        0: {
                                            items: 1,
                                            center: false
                                        },
                                        600: {
                                            items: 1,
                                            center: false
                                        },
                                        750: {
                                            items: 1,
                                            center: false
                                        },
                                        960: {
                                            items: 1
                                        },
                                        1170: {
                                            items: 1
                                        },
                                        1300: {
                                            items: 1
                                        }
                                    }
                                });
                    });

            $(".widget-testimonial-carousel").owlCarousel({
                rtl: THEMEMASCOT.isRTL.check(),
                autoplay: false,
                autoplayTimeout: 2000,
                smartSpeed: 400,
                items: 1,
                loop: true,
                dots: true,
                nav: false
            });

            $(".news-carousel-2col").owlCarousel(
                {
                    rtl: THEMEMASCOT.isRTL.check(),
                    autoplay: false,
                    autoplayTimeout: 4000,
                    loop: true,
                    margin: 15,
                    dots: false,
                    nav: true,
                    navText: ['<i class="fa fa-angle-left"></i>',
                        '<i class="fa fa-angle-right"></i>'],
                    responsive: {
                        0: {
                            items: 1,
                            center: false
                        },
                        600: {
                            items: 1,
                            center: false
                        },
                        960: {
                            items: 2
                        },
                        1170: {
                            items: 2
                        },
                        1300: {
                            items: 2
                        }
                    }
                });

            $(".news-carousel-3col").owlCarousel(
                {
                    rtl: THEMEMASCOT.isRTL.check(),
                    autoplay: false,
                    autoplayTimeout: 4000,
                    loop: true,
                    margin: 15,
                    dots: true,
                    nav: true,
                    navText: ['<i class="fa fa-angle-left"></i>',
                        '<i class="fa fa-angle-right"></i>'],
                    responsive: {
                        0: {
                            items: 1,
                            center: false
                        },
                        600: {
                            items: 1,
                            center: false
                        },
                        960: {
                            items: 2
                        },
                        1170: {
                            items: 3
                        },
                        1300: {
                            items: 3
                        }
                    }
                });

            $(".clients-logo.carousel").owlCarousel({
                rtl: THEMEMASCOT.isRTL.check(),
                autoplay: true,
                autoplayTimeout: 2000,
                items: 5,
                dots: false,
                nav: false,
                responsive: {
                    0: {
                        items: 3,
                        center: false
                    },
                    600: {
                        items: 3,
                        center: false
                    },
                    960: {
                        items: 4
                    },
                    1170: {
                        items: 6
                    },
                    1300: {
                        items: 6
                    }
                }
            });

            $('.recent-project')
                .each(
                    function () {
                        var data_dots = ($(this).data("dots") === undefined) ? false
                            : $(this).data("dots");
                        var data_nav = ($(this).data("nav") === undefined) ? false
                            : $(this).data("nav");
                        $(this)
                            .owlCarousel(
                                {
                                    rtl: THEMEMASCOT.isRTL
                                        .check(),
                                    autoplay: true,
                                    autoplayTimeout: 4000,
                                    loop: true,
                                    margin: 15,
                                    dots: false,
                                    nav: true,
                                    navText: [
                                        '<i class="fa fa-angle-left"></i>',
                                        '<i class="fa fa-angle-right"></i>'],
                                    responsive: {
                                        0: {
                                            items: 1,
                                            center: false
                                        },
                                        600: {
                                            items: 2,
                                            center: false
                                        },
                                        750: {
                                            items: 4,
                                            center: false
                                        },
                                        960: {
                                            items: 4
                                        },
                                        1170: {
                                            items: 4
                                        },
                                        1300: {
                                            items: 4
                                        }
                                    }
                                });
                    });

            $(".fullwidth-carousel").owlCarousel(
                {
                    rtl: THEMEMASCOT.isRTL.check(),
                    autoplay: true,
                    autoplayTimeout: 5000,
                    loop: true,
                    items: 1,
                    dots: false,
                    nav: true,
                    navText: ['<i class="pe-7s-angle-left"></i>',
                        '<i class="pe-7s-angle-right"></i>']
                });
        },

        /* ---------------------------------------------------------------------- */
        /* ----------------------------- BxSlider ------------------------------ */
        /* ---------------------------------------------------------------------- */
        TM_bxslider: function () {
            $('.bxslider').bxSlider({
                mode: 'vertical',
                minSlides: 3,
                slideMargin: 20,
                pager: false,
                prevText: '<i class="fa fa-angle-left"></i>',
                nextText: '<i class="fa fa-angle-right"></i>'
            });
        },

        /* ---------------------------------------------------------------------- */
        /* ---------- maximage Fullscreen Parallax Background Slider ----------- */
        /* ---------------------------------------------------------------------- */
        TM_maximageSlider: function () {
            $('#maximage').maximage({
                cycleOptions: {
                    fx: 'fade',
                    speed: 1500,
                    prev: '.img-prev',
                    next: '.img-next'
                }
            });
        }
    };

    /* ---------------------------------------------------------------------- */
    /* ---------- document ready, window load, scroll and resize ------------ */
    /* ---------------------------------------------------------------------- */
    // document ready
    THEMEMASCOT.documentOnReady = {
        init: function () {
            THEMEMASCOT.initialize.init();
            THEMEMASCOT.header.init();
            THEMEMASCOT.slider.init();
            THEMEMASCOT.widget.init();
            THEMEMASCOT.windowOnscroll.init();
            $.stellar('refresh');
        }
    };

    // window on load
    THEMEMASCOT.windowOnLoad = {
        init: function () {
            var t = setTimeout(function () {
                THEMEMASCOT.initialize.TM_wow();
                // THEMEMASCOT.widget.TM_twittie();
                THEMEMASCOT.initialize.TM_preLoaderOnLoad();
                // THEMEMASCOT.initialize.TM_hashForwarding();
                //THEMEMASCOT.initialize.TM_parallaxBgInit();
            }, 0);
            $window.trigger("scroll");
            $window.trigger("resize");
        }
    };

    // window on scroll
    THEMEMASCOT.windowOnscroll = {
        init: function () {
            $window.on('scroll', function () {
                THEMEMASCOT.header.TM_scroolToTop();
                THEMEMASCOT.header.TM_activateMenuItemOnReach();
                THEMEMASCOT.header.TM_topnavAnimate();
            });
        }
    };

    // window on resize
    THEMEMASCOT.windowOnResize = {
        init: function () {
            var t = setTimeout(function () {
                THEMEMASCOT.initialize.TM_equalHeightDivs();
                THEMEMASCOT.initialize.TM_resizeFullscreen();
                $.stellar('refresh');
            }, 400);
        }
    };

    /* ---------------------------------------------------------------------- */
    /* ---------------------------- Call Functions -------------------------- */
    /* ---------------------------------------------------------------------- */
    $document.ready(THEMEMASCOT.documentOnReady.init);
    $window.on('load', THEMEMASCOT.windowOnLoad.init);
    $window.on('resize', THEMEMASCOT.windowOnResize.init);

    // call function before document ready
    THEMEMASCOT.initialize.TM_preLoaderClickDisable();

})(jQuery);