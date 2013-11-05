/*
 * iviewer Widget for jQuery UI
 * https://github.com/can3p/iviewer
 *
 * Copyright (c) 2009 - 2012 Dmitry Petrov
 * Dual licensed under the MIT and GPL licenses.
 *  - http://www.opensource.org/licenses/mit-license.php
 *  - http://www.gnu.org/copyleft/gpl.html
 *
 * Author: Dmitry Petrov
 */

( function( $, undefined ) {

/**
 * Simple implementation of jQuery like getters/setters
 * var val = something();
 * something(val);
 */
var setter = function(setter, getter) {
    return function(val) {
        if (arguments.length === 0) {
            return getter.apply(this);
        } else {
            setter.apply(this, arguments);
        }
    }
};

/**
 * Internet explorer rotates image relative left top corner, so we should
 * shift image when it's rotated.
 */
var ieTransforms = {
        '0': {
            marginLeft: 0,
            marginTop: 0,
            filter: 'progid:DXImageTransform.Microsoft.Matrix(M11=1, M12=0, M21=0, M22=1, SizingMethod="auto expand")'
        },

        '90': {
            marginLeft: -1,
            marginTop: 1,
            filter: 'progid:DXImageTransform.Microsoft.Matrix(M11=0, M12=-1, M21=1, M22=0, SizingMethod="auto expand")'
        },

        '180': {
            marginLeft: 0,
            marginTop: 0,
            filter: 'progid:DXImageTransform.Microsoft.Matrix(M11=-1, M12=0, M21=0, M22=-1, SizingMethod="auto expand")'
        },

        '270': {
            marginLeft: -1,
            marginTop: 1,
            filter: 'progid:DXImageTransform.Microsoft.Matrix(M11=0, M12=1, M21=-1, M22=0, SizingMethod="auto expand")'
        }
    },
    // this test is the inversion of the css filters test from the modernizr project
    useIeTransforms = function() {
        var el = document.createElement('div');
        el.style.cssText = ['-ms-','' ,''].join('filter:blur(2px); ');
        return !!el.style.cssText && document.documentMode < 9;
    }();

$.widget( "ui.iviewer", $.ui.mouse, {
    widgetEventPrefix: "iviewer",
    options : {
        /**
        * Choose this device is mobile
        **/
        is_mobile_device: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
        /**
        * start zoom value for image, not used now
        * may be equal to "fit" to fit image into container or scale in %
        **/
        zoom: "fit",
        /**
        * base value to scale image
        **/
        zoom_base: 100,
        /**
        * maximum zoom
        **/
        zoom_max: 800,
        /**
        * minimum zoom
        **/
        zoom_min: 25,
        /**
        * base of rate multiplier.
        * zoom is calculated by formula: zoom_base * zoom_delta^rate
        **/
        zoom_delta: 1.4,
        /**
        * whether the zoom should be animated.
        */
        zoom_animation: true,
        /**
        * if true plugin doesn't add its own controls
        **/
        ui_disabled: false,
        /**
         * If false mousewheel will be disabled
         */
        mousewheel: true,
        /**
         * If false pinch will be disabled
         */
        pinch: true,
        /**
         * If false swipe will be disabled
         */
        swipe: true,
        /**
        * if false, plugin doesn't bind resize event on window and this must
        * be handled manually
        **/
        update_on_resize: true,
        /**
        *
        **/
        dbl_click_delay: 200,
        /**
        *
        **/
        dbl_tap_delay: 200,
        /**
        * Config for hammer.js to container element
        **/
        hammer_container_config: {
            prevent_default: true
        },
        /**
        * Config for hammer.js to image object
        **/
        hammer_image_config: {
            prevent_default: true
        },
        /**
        * event is triggered when zoom value is changed
        * @param int new zoom value
        * @return boolean if false zoom action is aborted
        **/
        onZoom: jQuery.noop,
        /**
        * event is triggered when zoom value is changed after image is set to the new dimensions
        * @param int new zoom value
        * @return boolean if false zoom action is aborted
        **/
        onAfterZoom: jQuery.noop,
        /**
        * event is fired on drag begin
        * @param object coords mouse coordinates on the image
        * @return boolean if false is returned, drag action is aborted
        **/
        onStartDrag: jQuery.noop,
        /**
        * event is fired on drag action
        * @param object coords mouse coordinates on the image
        **/
        onDrag: jQuery.noop,
        /**
        * event is fired on drag stop
        * @param object coords mouse coordinates on the image
        **/
        onStopDrag: jQuery.noop,
        /**
        * event is fired when mouse moves over image
        * @param object coords mouse coordinates on the image
        **/
        onMouseMove: jQuery.noop,
        /**
        * mouse click event
        * @param object coords mouse coordinates on the image
        **/
        onClick: jQuery.noop,
        /**
        * mouse dpuble tap event
        * @param object coords mouse coordinates on the image
        **/
        onDblClick: jQuery.noop,

        /**
        * touch tap event
        * @param object coords mouse coordinates on the image
        **/
        onTap: jQuery.noop,
        /**
        * touch double tap event
        * @param object coords mouse coordinates on the image
        **/
        onDblTap: jQuery.noop,

        /**
        * touch swipe left
        **/
        onSwipeLeft: jQuery.noop,
        /**
        * touch swipe right
        **/
        onSwipeRight: jQuery.noop,
        /**
        * touch swipe up
        **/
        onSwipeUp: jQuery.noop,
        /**
        * touch swipe down
        **/
        onSwipeDown: jQuery.noop,

        /**
        * event is fired when image starts to load
        */
        onStartLoad: null,
        /**
        * event is fired, when image is loaded and initially positioned
        */
        onFinishLoad: null,
        /**
        * event is fired when image load error occurs
        */
        onErrorLoad: null,
        /**
        * event is fired when image starts to change
        */
        onStartChange: null,
        /**
        * event is fired, when image is changed
        */
        onFinishChange: null,
        /**
        * event is fired when image change error occurs
        */
        onErrorChange: null,
        /**
        * event is fired when image change error occurs
        */
        onErrorImageLoad: null
    },

    _pinch_scale: 0,

    _sides: {
        left: false,
        right: false,
        top: false,
        bottom: false
    },

    _create: function() {
        var me = this;

        //drag variables
        this.dx = 0;
        this.dy = 0;

        /* object containing actual information about image
        *   @img_object.object - jquery img object
        *   @img_object.orig_{width|height} - original dimensions
        *   @img_object.display_{width|height} - actual dimensions
        */
        this.img_object = {};

        this.zoom_object = {}; //object to show zoom status

        this._angle = 0;

        this.current_zoom = this.options.zoom;

        if(this.options.src === null) {
            return;
        }

        this.container = this.element;

        this._updateContainerInfo();

        //init container
        this.container.css("overflow", "hidden");

        if (this.options.update_on_resize == true) {
            $(window).resize(function() {
                me.update();
            });
        }

        this.img_object = new $.ui.iviewer.ImageObject(this.options.zoom_animation);
        if (this.options.is_mobile_device) {
            this.container.hammer(this.options.hammer_container_config);
            this.img_object.object().hammer(this.options.hammer_image_config);

            if (this.options.pinch) {
                this.container
                    .on('pinch', function(ev) {
                        var container_offset = me.container.offset(),
                            mouse_pos = {
                                x: ev.gesture.center.pageX - container_offset.left,
                                y: ev.gesture.center.pageY - container_offset.top
                            };
                        me.set_zoom(me.current_zoom + me.current_zoom * (ev.gesture.scale - me._pinch_scale), undefined, mouse_pos);
                        me._pinch_scale = ev.gesture.scale;
                    })
                    .on('transformstart', function(ev) {
                        me._pinch_scale = ev.gesture.scale;
                    });
            }

            if (this.options.swipe) {
                this.container
                .on('swipeleft', function(ev) {
                    return me._swipeleft(ev);
                })
                .on('swiperight', function(ev) {
                    return me._swiperight(ev);
                })
                .on('swipeup', function(ev) {
                    return me._swipeup(ev);
                })
                .on('swipedown', function(ev) {
                    return me._swipedown(ev);
                });
            }

            var tap_count = 0, tap_timer = null;
            this.img_object.object()
                .on('tap', function(ev) {
                    tap_count++;
                    if (tap_count === 1) {
                        tap_timer = setTimeout(function() {
                            tap_count = 0;
                            return me._tap(ev);
                        }, me.options.dbl_tap_delay);
                    } else {
                        clearTimeout(tap_timer);
                        tap_count = 0;
                        return me._dbltap(ev);
                    }
                })
                .on('dragstart', function(ev) {
                    if (me._trigger('onStartDrag', 0, me._getMouseCoords(ev.gesture.center)) === false) {
                        return false;
                    }

                    me.container.addClass("iviewer_drag_touch");

                    me.dx = ev.gesture.center.pageX - me.img_object.x();
                    me.dy = ev.gesture.center.pageY - me.img_object.y();

                    return true;
                })
                .on('drag', function(ev) {
                    if (!me._dragInitialized) {
                        me.dx = ev.gesture.center.pageX - me.img_object.x();
                        me.dy = ev.gesture.center.pageY - me.img_object.y();
                        me._dragInitialized = true;
                    }
                    var ltop = ev.gesture.center.pageY - me.dy;
                    var lleft = ev.gesture.center.pageX - me.dx;

                    me.setCoords(lleft, ltop);
                    me._trigger('onDrag', ev, me._getMouseCoords(ev.gesture.center));
                    return false;
                })
                .on('dragstop', function(ev){
                    me.container.removeClass("iviewer_drag_touch");

                    me._trigger('onStopDrag', 0, me._getMouseCoords(ev.gesture.center));
                });

        } else {
            if (this.options.mousewheel) {
                this.container.mousewheel(function(ev, delta) {
                    var zoom = (delta > 0) ? 1 : -1,
                        container_offset = me.container.offset(),
                        mouse_pos = {
                            x: ev.pageX - container_offset.left,
                            y: ev.pageY - container_offset.top
                        };
                    me.zoom_by(zoom, mouse_pos);
                    return false;
                });
            }
            var click_count = 0, click_timer = null;
            this.img_object.object().click( function(ev) {
                click_count++;
                if (click_count === 1) {
                    click_timer = setTimeout(function() {
                        click_count = 0;
                        return me._click(ev);
                    }, me.options.dbl_click_delay);
                } else {
                    clearTimeout(click_timer);
                    click_count = 0;
                    return me._dblclick(ev);
                }
            });
            this.container.bind('mousemove', function(ev) { me._handleMouseMove(ev); });
        }


        this.img_object.object().prependTo(this.container);

        this.loadImage(this.options.src);

        if(!this.options.ui_disabled) { this.createui(); }

        this._mouseInit();
    },

    destroy: function() {
        $.Widget.prototype.destroy.call( this );
        this._mouseDestroy();
        this.img_object.object().remove();
        this.container.off('.iviewer');
        this.container.css('overflow', ''); //cleanup styles on destroy
    },

    _updateContainerInfo: function() {
        this.options.height = this.container.height();
        this.options.width = this.container.width();
    },

    update: function() {
        this._updateContainerInfo();
        this.setCoords(this.img_object.x(), this.img_object.y());
    },

    changeImage: function ( src ) {
        var me = this;
        this._trigger('onStartChange', 0, src);
        this.container.addClass("iviewer_loading");
        this.img_object.change (src, function(){
            me._imageChanged(src);
        }, function(){
            me._trigger("onErrorChange", 0, src);
        });
    },

    _imageChanged: function(src) {
        this.container.removeClass("iviewer_loading");
        this.container.addClass("iviewer_cursor");
        this._trigger('onFinishChange', 0, src);
    },

    loadImage: function( src ) {
        this.current_zoom = this.options.zoom;
        var me = this;

        this._trigger('onStartLoad', 0, src);

        this.container.addClass("iviewer_loading");
        this.img_object.load(src, function() {
            me._imageLoaded(src);
        }, function() {
            me._trigger("onErrorLoad", 0, src);
        });
        $(this.img_object).on('errorImageLoad',function(){
            me._trigger('onErrorImageLoad', 0, src);
        });
    },

    _imageLoaded: function(src) {
        this.container.removeClass("iviewer_loading");
        this.container.addClass("iviewer_cursor");

        if(this.options.zoom == "fit"){
            this.fit(true);
        }
        else {
            this.set_zoom(this.options.zoom, true);
        }

        this._trigger('onFinishLoad', 0, src);
    },

    /**
    * fits image in the container
    *
    * @param {boolean} skip_animation
    **/
    fit: function(skip_animation) {
        var aspect_ratio = this.img_object.orig_width() / this.img_object.orig_height();
        var window_ratio = this.options.width /  this.options.height;
        var choose_left = (aspect_ratio > window_ratio);
        var new_zoom = 0;

        if(choose_left){
            new_zoom = this.options.width / this.img_object.orig_width() * 100;
        }
        else {
            new_zoom = this.options.height / this.img_object.orig_height() * 100;
        }

      this.set_zoom(new_zoom, skip_animation);
    },

    /**
    * center image in container
    **/
    center: function() {
        this.setCoords(-Math.round((this.img_object.display_width() - this.options.width)/2),
                -Math.round((this.img_object.display_height() - this.options.height)/2));
    },

    /**
    *  move a point in container to the center of display area
    *  @param x a point in container
    *  @param y a point in container
    **/
    moveTo: function(x, y) {
        var dx = x-Math.round(this.options.width/2);
        var dy = y-Math.round(this.options.height/2);

        var new_x = this.img_object.x() - dx;
        var new_y = this.img_object.y() - dy;
        this.setCoords(new_x, new_y);
    },

    /**
    *
    *
    *
    **/
    moveToSide: function(side) {
        var new_x, new_y;
        switch (side) {
            case 'left':
                new_x = 0;
                new_y = this.img_object.y();
                this.setCoords(new_x, new_y);
                return true;
            case 'right':
                new_x = this.options.width - this.img_object.display_width();
                new_y = this.img_object.y();
                this.setCoords(new_x, new_y);
                return true;
            case 'top':
                new_x = this.img_object.x();
                new_y = 0;
                this.setCoords(new_x, new_y);
                return true;
            case 'bottom':
                new_x = this.img_object.x();
                new_y = this.options.height - this.img_object.display_height();
                this.setCoords(new_x, new_y);
                return true;
        }
        return false;
    },

    /**
     * Get container offset object.
     */
    getContainerOffset: function() {
        return jQuery.extend({}, this.container.offset());
    },

    /**
    * set coordinates of upper left corner of image object
    **/
    setCoords: function(x, y) {
        //do nothing while image is being loaded
        if(!this.img_object.loaded()) { return; }

        var coords = this._correctCoords(x,y);
        this.img_object.x(coords.x);
        this.img_object.y(coords.y);
        this.container.trigger('onImageCoordsChange');
    },

    _correctCoords: function(x, y) {
        x = parseInt(x, 10);
        y = parseInt(y, 10);
        //check new coordinates to be correct (to be in rect)
        if(y >= 0){
            y = 0;
            this._sides.top = true;
        } else {
            this._sides.top = false;
        }

        if(x >= 0){
            x = 0;
            this._sides.left = true;
        } else {
            this._sides.left = false;
        }

        if(y + this.img_object.display_height() <= this.options.height){
            y = this.options.height - this.img_object.display_height();
            this._sides.bottom = true;
        } else {
            this._sides.bottom = false;
        }

        if(x + this.img_object.display_width() <= this.options.width){
            x = this.options.width - this.img_object.display_width();
            this._sides.right = true;
        } else {
            this._sides.right = false;
        }

        if(this.img_object.display_width() <= this.options.width){
            x = -(this.img_object.display_width() - this.options.width)/2;
            this._sides.left = true;
        }

        if(this.img_object.display_height() <= this.options.height){
            y = -(this.img_object.display_height() - this.options.height)/2;
            this._sides.top = true;
        }
        return { x: x, y: y};
    },

    /**
    * convert coordinates on the container to the coordinates on the image (in original size)
    *
    * @return object with fields x,y according to coordinates or false
    * if initial coords are not inside image
    **/
    containerToImage : function (x,y) {
        var coords = { x : x - this.img_object.x(),
                 y :  y - this.img_object.y()
        };

        coords = this.img_object.toOriginalCoords(coords);

        return { x :  util.descaleValue(coords.x, this.current_zoom),
                 y :  util.descaleValue(coords.y, this.current_zoom)
        };
    },

    /**
    * convert coordinates on the image (in original size, and zero angle) to the coordinates on the container
    *
    * @return object with fields x,y according to coordinates
    **/
    imageToContainer : function (x,y) {
        var coords = {
                x : util.scaleValue(x, this.current_zoom),
                y : util.scaleValue(y, this.current_zoom)
            };

        return this.img_object.toRealCoords(coords);
    },

    /**
    * get mouse coordinates on the image
    * @param e - object containing pageX and pageY fields, e.g. mouse event object
    *
    * @return object with fields x,y according to coordinates or false
    * if initial coords are not inside image
    **/
    _getMouseCoords : function(e) {
        var containerOffset = this.container.offset();
            coords = this.containerToImage(e.pageX - containerOffset.left, e.pageY - containerOffset.top);
        return coords;
    },

    /**
    * set image scale to the new_zoom
    *
    * @param {number} new_zoom image scale in %
    * @param {boolean} skip_animation
    * @param {x: number, y: number} Coordinates of point the should not be moved on zoom. The default is the center of image.
    **/
    set_zoom: function(new_zoom, skip_animation, zoom_center) {
        if (this._trigger('onZoom', 0, new_zoom) == false) {
            return;
        }

        //do nothing while image is being loaded
        if(!this.img_object.loaded()) { return; }

        zoom_center = zoom_center || {
            x: Math.round(this.options.width/2),
            y: Math.round(this.options.height/2)
        }

        if(new_zoom <  this.options.zoom_min)
        {
            new_zoom = this.options.zoom_min;
        }
        else if(new_zoom > this.options.zoom_max)
        {
            new_zoom = this.options.zoom_max;
        }

        /* we fake these values to make fit zoom properly work */
        if(this.current_zoom == "fit")
        {
            var old_x = zoom_center.x + Math.round(this.img_object.orig_width()/2);
            var old_y = zoom_center.y + Math.round(this.img_object.orig_height()/2);
            this.current_zoom = 100;
        }
        else {
            var old_x = -this.img_object.x() + zoom_center.x;
            var old_y = -this.img_object.y() + zoom_center.y
        }

        var new_width = util.scaleValue(this.img_object.orig_width(), new_zoom);
        var new_height = util.scaleValue(this.img_object.orig_height(), new_zoom);
        var new_x = util.scaleValue( util.descaleValue(old_x, this.current_zoom), new_zoom);
        var new_y = util.scaleValue( util.descaleValue(old_y, this.current_zoom), new_zoom);

        new_x = zoom_center.x - new_x;
        new_y = zoom_center.y - new_y;

        new_width = Math.floor(new_width);
        new_height = Math.floor(new_height);
        new_x = Math.floor(new_x);
        new_y = Math.floor(new_y);

        this.img_object.display_width(new_width);
        this.img_object.display_height(new_height);

        var coords = this._correctCoords( new_x, new_y ),
            self = this;

        this.img_object.setImageProps(new_width, new_height, coords.x, coords.y,
                                        skip_animation, function() {
            self._trigger('onAfterZoom', 0, new_zoom );
        });
        this.current_zoom = new_zoom;

        this.update_status();
        this.container.trigger('onImageCoordsChange');
    },

    /**
    * changes zoom scale by delta
    * zoom is calculated by formula: zoom_base * zoom_delta^rate
    * @param Integer delta number to add to the current multiplier rate number
    * @param {x: number, y: number=} Coordinates of point the should not be moved on zoom.
    **/
    zoom_by: function(delta, zoom_center) {
        var closest_rate = this.find_closest_zoom_rate(this.current_zoom);

        var next_rate = closest_rate + delta
        var next_zoom = this.options.zoom_base * Math.pow(this.options.zoom_delta, next_rate)
        if(delta > 0 && next_zoom < this.current_zoom)
        {
            next_zoom *= this.options.zoom_delta;
        }

        if(delta < 0 && next_zoom > this.current_zoom)
        {
            next_zoom /= this.options.zoom_delta;
        }

        this.set_zoom(next_zoom, undefined, zoom_center);
    },

    /**
    * Rotate image
    * @param {num} deg Degrees amount to rotate. Positive values rotate image clockwise.
    *     Currently 0, 90, 180, 270 and -90, -180, -270 values are supported
    *
    * @param {boolean} abs If the flag is true if, the deg parameter will be considered as
    *     a absolute value and relative otherwise.
    * @return {num|null} Method will return current image angle if called without any arguments.
    **/
    angle: function(deg, abs) {
        if (arguments.length === 0) { return this.img_object.angle(); }

        if (deg < -270 || deg > 270 || deg % 90 !== 0) { return; }
        if (!abs) { deg += this.img_object.angle(); }
        if (deg < 0) { deg += 360; }
        if (deg >= 360) { deg -= 360; }

        if (deg === this.img_object.angle()) { return; }

        this.img_object.angle(deg);
        //the rotate behavior is different in all editors. For now we  just center the
        //image. However, it will be better to try to keep the position.
        this.center();
        this._trigger('angle', 0, { angle: this.img_object.angle() });
    },

    /**
    * finds closest multiplier rate for value
    * basing on zoom_base and zoom_delta values from settings
    * @param Number value zoom value to examine
    **/
    find_closest_zoom_rate: function(value) {
        if(value == this.options.zoom_base)
        {
            return 0;
        }

        function div(val1,val2) { return val1 / val2 };
        function mul(val1,val2) { return val1 * val2 };

        var func = (value > this.options.zoom_base)?mul:div;
        var sgn = (value > this.options.zoom_base)?1:-1;

        var mltplr = this.options.zoom_delta;
        var rate = 1;

        while(Math.abs(func(this.options.zoom_base, Math.pow(mltplr,rate)) - value) >
              Math.abs(func(this.options.zoom_base, Math.pow(mltplr,rate+1)) - value))
        {
            rate++;
        }

        return sgn * rate;
    },

    /* update scale info in the container */
    update_status: function() {
        if(!this.options.ui_disabled)
        {
            var percent = Math.round(100*this.img_object.display_height()/this.img_object.orig_height());
            if(percent)
            {
                this.zoom_object.html(percent + "%");
            }
        }
    },

    add_marker: function(x, y, template, x_correct, y_correct) {
        x = Math.round(x) || 50;
        y = Math.round(y) || 50;
        template = template || '<a class="marker"></a>';
        x_correct = x_correct || 0;
        y_correct = y_correct || 0;

        var marker = $(template);
        var me = this, containerCoords;
        var new_marker_coords = function() {
            containerCoords = me.imageToContainer(x, y);
            marker.css('left', containerCoords.x + x_correct);
            marker.css('top', containerCoords.y + y_correct);
        };
        new_marker_coords();
        this.container.on('onImageCoordsChange', new_marker_coords);

        this.container.append(marker);
        return {x: x, y: y, marker: marker};
    },

    /**
     * Get some information about the image.
     *     Currently orig_(width|height), display_(width|height), angle, zoom and src params are supported.
     *
     *  @param {string} parameter to check
     *  @param {boolean} withoutRotation if param is orig_width or orig_height and this flag is set to true,
     *      method will return original image width without considering rotation.
     *
     */
    info: function(param, withoutRotation) {
        if (!param) { return; }

        switch (param) {
            case 'sides':
                return this._sides;
            case 'orig_width':
            case 'orig_height':
                if (withoutRotation) {
                    return (this.img_object.angle() % 180 === 0 ? this.img_object[param]() :
                            param === 'orig_width' ? this.img_object.orig_height() : 
                                                        this.img_object.orig_width());
                } else {
                    return this.img_object[param]();
                }
            case 'display_width':
            case 'display_height':
            case 'angle':
                return this.img_object[param]();
            case 'zoom':
                return this.current_zoom;
            case 'src':
                return this.img_object.object().attr('src');
            case 'coords':
                return {
                    x: this.img_object.x(),
                    y: this.img_object.y()
                };
        }
    },

    /**
    *   callback for handling mousdown event to start dragging image
    **/
    _mouseStart: function( e ) {
        $.ui.mouse.prototype._mouseStart.call(this, e);
        if (this._trigger('onStartDrag', 0, this._getMouseCoords(e)) === false) {
            return false;
        }

        /* start drag event*/
        this.container.addClass("iviewer_drag_cursor");

        //#10: fix movement quirks for ipad
        this._dragInitialized = !(e.originalEvent.changedTouches && e.originalEvent.changedTouches.length==1);

        this.dx = e.pageX - this.img_object.x();
        this.dy = e.pageY - this.img_object.y();

        this._drag = true;
        return true;
    },

    _mouseCapture: function( e ) {
        return true;
    },

    /**
     * Handle mouse move if needed. User can avoid using this callback, because
     *    he can get the same information through public methods.
     *  @param {jQuery.Event} e
     */
    _handleMouseMove: function(e) {
        this._trigger('onMouseMove', e, this._getMouseCoords(e));
    },

    /**
    *   callback for handling mousemove event to drag image
    **/
    _mouseDrag: function(e) {
        $.ui.mouse.prototype._mouseDrag.call(this, e);

        //#10: imitate mouseStart, because we can get here without it on iPad for some reason
        if (!this._dragInitialized) {
            this.dx = e.pageX - this.img_object.x();
            this.dy = e.pageY - this.img_object.y();
            this._dragInitialized = true;
        }

        var ltop =  e.pageY - this.dy;
        var lleft = e.pageX - this.dx;

        this.setCoords(lleft, ltop);
        this._trigger('onDrag', e, this._getMouseCoords(e));
        return false;
    },

    /**
    *   callback for handling stop drag
    **/
    _mouseStop: function(e) {
        $.ui.mouse.prototype._mouseStop.call(this, e);
        this.container.removeClass("iviewer_drag_cursor");
        this._trigger('onStopDrag', 0, this._getMouseCoords(e));
    },

    _click: function(e) {
        if (!this._drag) this._trigger('onClick', 0, this._getMouseCoords(e));
        this._drag = false;
    },

    _dblclick: function(e){
        this._trigger('onDblClick', 0, this._getMouseCoords(e));
    },

    _tap: function(e) {
        //ToDo get tap coordinates
        this._trigger('onTap', 0, this._getMouseCoords(e.gesture.center));
    },

    _dbltap: function(e){
        //ToDo get tap coordinates
        this._trigger('onDblTap', 0, this._getMouseCoords(e.gesture.center));
    },

    _swipeleft: function(e) {
        this._trigger('onSwipeLeft', 0, this._getMouseCoords(e.gesture.center));
    },

    _swiperight: function(e) {
        this._trigger('onSwipeRight', 0, this._getMouseCoords(e.gesture.center));
    },
    _swipeup: function(e) {
        this._trigger('onSwipeUp', 0, this._getMouseCoords(e.gesture.center));
    },

    _swipedown: function(e) {
        this._trigger('onSwipeDown', 0, this._getMouseCoords(e.gesture.center));
    },

    /**
    *   create zoom buttons info box
    **/
    createui: function() {
        var me=this;

        $("<div>", { 'class': "iviewer_zoom_in iviewer_common iviewer_button"})
                    .bind('mousedown touchstart',function(){me.zoom_by(1); return false;})
                    .appendTo(this.container);

        $("<div>", { 'class': "iviewer_zoom_out iviewer_common iviewer_button"})
                    .bind('mousedown touchstart',function(){me.zoom_by(- 1); return false;})
                    .appendTo(this.container);

        $("<div>", { 'class': "iviewer_zoom_zero iviewer_common iviewer_button"})
                    .bind('mousedown touchstart',function(){me.set_zoom(100); return false;})
                    .appendTo(this.container);

        $("<div>", { 'class': "iviewer_zoom_fit iviewer_common iviewer_button"})
                    .bind('mousedown touchstart',function(){me.fit(this); return false;})
                    .appendTo(this.container);

        this.zoom_object = $("<div>").addClass("iviewer_zoom_status iviewer_common")
                                    .appendTo(this.container);

        $("<div>", { 'class': "iviewer_rotate_left iviewer_common iviewer_button"})
                    .bind('mousedown touchstart',function(){me.angle(-90); return false;})
                    .appendTo(this.container);

        $("<div>", { 'class': "iviewer_rotate_right iviewer_common iviewer_button" })
                    .bind('mousedown touchstart',function(){me.angle(90); return false;})
                    .appendTo(this.container);

        this.update_status(); //initial status update
    }

} );

/**
 * @class $.ui.iviewer.ImageObject Class represents image and provides public api without
 *     extending image prototype.
 * @constructor
 * @param {boolean} do_anim Do we want to animate image on dimension changes?
 */
$.ui.iviewer.ImageObject = function(do_anim) {
    this._img = $("<img>")
            //this is needed, because chromium sets them auto otherwise
            .css({ position: "absolute", top :"0px", left: "0px"});

    this._loaded = false;
    this._swapDimensions = false;
    this._do_anim = do_anim || false;
    this.x(0, true);
    this.y(0, true);
    this.angle(0);
};


/** @lends $.ui.iviewer.ImageObject.prototype */
(function() {
    /**
     * Restore initial object state.
     *
     * @param {number} w Image width.
     * @param {number} h Image height.
     */
    this._reset = function(w, h) {
        this._angle = 0;
        this._swapDimensions = false;
        this.x(0);
        this.y(0);

        this.orig_width(w);
        this.orig_height(h);
        this.display_width(w);
        this.display_height(h);
    };

    /**
     * Check if image is loaded.
     *
     * @return {boolean}
     */
    this.loaded = function() { return this._loaded; };

    /**
     * Load image.
     *
     * @param {string} src Image url.
     * @param {Function=} loaded Function will be called on image load.
     */
    this.load = function(src, loaded, error) {
        var self = this;

        loaded = loaded || jQuery.noop;
        this._loaded = false;

        //If we assign new image url to the this._img IE9 fires onload event and image width and
        //height are set to zero. So, we create another image object and load image through it.
        var img = new Image();
        img.onload = function() {
            self._loaded = true;
            self._reset(this.width, this.height);

            self._img
                .removeAttr("width")
                .removeAttr("height")
                .removeAttr("style")
                //max-width is reset, because plugin breaks in the twitter bootstrap otherwise
                .css({ position: "absolute", top :"0px", left: "0px", maxWidth: "none"})

            self._img[0].src = src;
            loaded();
        };

        img.onerror = error;

        //we need this because sometimes internet explorer 8 fires onload event
        //right after assignment (synchronously)
        setTimeout(function() {
            img.src = src;
            $(img).error(function(){
                $(self).trigger("errorImageLoad");
            });
        }, 0);

        this.angle(0);
    };

    /**
     * Check if image is changed.
     *
     * @return {boolean}
     */
    this.changed = function() { return this._changed; };

    /**
     * Chnage image.
     *
     * @param {string} src Image url.
     * @param {Function=} changed Function will be called on image load.
     */
    this.change = function(src, changed, error) {
        var self = this;

        changed = changed || jQuery.noop;
        this._changed = false;

        //If we assign new image url to the this._img IE9 fires onload event and image width and
        //height are set to zero. So, we create another image object and load image through it.
        var img = new Image();
        img.onload = function() {
            self._changed = true;
            self._img[0].src = src;
            changed();
        };
        img.onerror = error;

        //we need this because sometimes internet explorer 8 fires onload event
        //right after assignment (synchronously)
        setTimeout(function() {
            img.src = src;
            $(img).error(function(){
                $(self).trigger("errorImageLoad");
            });
        }, 0);
    };

    this._dimension = function(prefix, name) {
        var horiz = '_' + prefix + '_' + name,
            vert = '_' + prefix + '_' + (name === 'height' ? 'width' : 'height');
        return setter(function(val) {
                this[this._swapDimensions ? horiz: vert] = val;
            },
            function() {
                return this[this._swapDimensions ? horiz: vert];
            });
    };

    /**
     * Getters and setter for common image dimensions.
     *    display_ means real image tag dimensions
     *    orig_ means physical image dimensions.
     *  Note, that dimensions are swapped if image is rotated. It necessary,
     *  because as little as possible code should know about rotation.
     */
    this.display_width = this._dimension('display', 'width'),
    this.display_height = this._dimension('display', 'height'),
    this.display_diff = function() { return Math.floor( this.display_width() - this.display_height() ) };
    this.orig_width = this._dimension('orig', 'width'),
    this.orig_height = this._dimension('orig', 'height'),

    /**
     * Setter for  X coordinate. If image is rotated we need to additionaly shift an
     *     image to map image coordinate to the visual position.
     *
     * @param {number} val Coordinate value.
     * @param {boolean} skipCss If true, we only set the value and do not touch the dom.
     */
    this.x = setter(function(val, skipCss) { 
            this._x = val;
            if (!skipCss) {
                this._finishAnimation();
                this._img.css("left",this._x + (this._swapDimensions ? this.display_diff() / 2 : 0) + "px");
            }
        },
        function() {
            return this._x;
        });

    /**
     * Setter for  Y coordinate. If image is rotated we need to additionaly shift an
     *     image to map image coordinate to the visual position.
     *
     * @param {number} val Coordinate value.
     * @param {boolean} skipCss If true, we only set the value and do not touch the dom.
     */
    this.y = setter(function(val, skipCss) {
            this._y = val;
            if (!skipCss) {
                this._finishAnimation();
                this._img.css("top",this._y - (this._swapDimensions ? this.display_diff() / 2 : 0) + "px");
            }
        },
       function() {
            return this._y;
       });

    /**
     * Perform image rotation.
     *
     * @param {number} deg Absolute image angle. The method will work with values 0, 90, 180, 270 degrees.
     */
    this.angle = setter(function(deg) {
            var prevSwap = this._swapDimensions;

            this._angle = deg;
            this._swapDimensions = deg % 180 !== 0;

            if (prevSwap !== this._swapDimensions) {
                var verticalMod = this._swapDimensions ? -1 : 1;
                this.x(this.x() - verticalMod * this.display_diff() / 2, true);
                this.y(this.y() + verticalMod * this.display_diff() / 2, true);
            };

            var cssVal = 'rotate(' + deg + 'deg)',
                img = this._img;

            jQuery.each(['', '-webkit-', '-moz-', '-o-', '-ms-'], function(i, prefix) {
                img.css(prefix + 'transform', cssVal);
            });

            if (useIeTransforms) {
                jQuery.each(['-ms-', ''], function(i, prefix) {
                    img.css(prefix + 'filter', ieTransforms[deg].filter);
                });

                img.css({
                    marginLeft: ieTransforms[deg].marginLeft * this.display_diff() / 2,
                    marginTop: ieTransforms[deg].marginTop * this.display_diff() / 2
                });
            }
        },
       function() { return this._angle; });

    /**
     * Map point in the container coordinates to the point in image coordinates.
     *     You will get coordinates of point on image with respect to rotation,
     *     but will be set as if image was not rotated.
     *     So, if image was rotated 90 degrees, it's (0,0) point will be on the
     *     top right corner.
     *
     * @param {{x: number, y: number}} point Point in container coordinates.
     * @return  {{x: number, y: number}}
     */
    this.toOriginalCoords = function(point) {
        switch (this.angle()) {
            case 0: return { x: point.x, y: point.y }
            case 90: return { x: point.y, y: this.display_width() - point.x }
            case 180: return { x: this.display_width() - point.x, y: this.display_height() - point.y }
            case 270: return { x: this.display_height() - point.y, y: point.x }
        }
    };

    /**
     * Map point in the image coordinates to the point in container coordinates.
     *     You will get coordinates of point on container with respect to rotation.
     *     Note, if image was rotated 90 degrees, it's (0,0) point will be on the
     *     top right corner.
     *
     * @param {{x: number, y: number}} point Point in container coordinates.
     * @return  {{x: number, y: number}}
     */
    this.toRealCoords = function(point) {
        switch (this.angle()) {
            case 0: return { x: this.x() + point.x, y: this.y() + point.y }
            case 90: return { x: this.x() + this.display_width() - point.y, y: this.y() + point.x}
            case 180: return { x: this.x() + this.display_width() - point.x, y: this.y() + this.display_height() - point.y}
            case 270: return { x: this.x() + point.y, y: this.y() + this.display_height() - point.x}
        }
    };

    /**
     * @return {jQuery} Return image node. this is needed to add event handlers.
     */
    this.object = setter(jQuery.noop,
                           function() { return this._img; });

    /**
     * Change image properties.
     *
     * @param {number} disp_w Display width;
     * @param {number} disp_h Display height;
     * @param {number} x
     * @param {number} y
     * @param {boolean} skip_animation If true, the animation will be skiped despite the
     *     value set in constructor.
     * @param {Function=} complete Call back will be fired when zoom will be complete.
     */
    this.setImageProps = function(disp_w, disp_h, x, y, skip_animation, complete) {
        complete = complete || jQuery.noop;

        this.display_width(disp_w);
        this.display_height(disp_h);
        this.x(x, true);
        this.y(y, true);

        var w = this._swapDimensions ? disp_h : disp_w;
        var h = this._swapDimensions ? disp_w : disp_h;

        var params = {
            width: w,
            height: h,
            top: y - (this._swapDimensions ? this.display_diff() / 2 : 0) + "px",
            left: x + (this._swapDimensions ? this.display_diff() / 2 : 0) + "px" 
        };

        if (useIeTransforms) {
            jQuery.extend(params, {
                marginLeft: ieTransforms[this.angle()].marginLeft * this.display_diff() / 2,
                marginTop: ieTransforms[this.angle()].marginTop * this.display_diff() / 2
            });
        }

        var swapDims = this._swapDimensions,
            img = this._img;

        //here we come: another IE oddness. If image is rotated 90 degrees with a filter, than
        //width and height getters return real width and height of rotated image. The bad news
        //is that to set height you need to set a width and vice versa. Fuck IE.
        //So, in this case we have to animate width and height manually.
        if(useIeTransforms && swapDims) {
            var ieh = this._img.width(),
                iew = this._img.height(),
                iedh = params.height - ieh;
                iedw = params.width - iew;

            delete params.width;
            delete params.height;
        }

        if (this._do_anim && !skip_animation) {
            this._img.stop(true)
                .animate(params, {
                    duration: 200, 
                    complete: complete,
                    step: function(now, fx) {
                        if(useIeTransforms && swapDims && (fx.prop === 'top')) {
                            var percent = (now - fx.start) / (fx.end - fx.start);

                            img.height(ieh + iedh * percent);
                            img.width(iew + iedw * percent);
                            img.css('top', now);
                        }
                    }
                });
        } else {
            this._img.css(params);
            setTimeout(complete, 0); //both if branches should behave equally.
        }
    };

    //if we set image coordinates we need to be sure that no animation is active atm
    this._finishAnimation = function() {
      this._img.stop(true, true);
    }

}).apply($.ui.iviewer.ImageObject.prototype);



var util = {
    scaleValue: function(value, toZoom)
    {
        return value * toZoom / 100;
    },

    descaleValue: function(value, fromZoom)
    {
        return value * 100 / fromZoom;
    }
};

 } )( jQuery, undefined );
