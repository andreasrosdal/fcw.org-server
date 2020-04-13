/**********************************************************************
    Freeciv-web - the web version of Freeciv. http://play.freeciv.org/
    Copyright (C) 2009-2015  The Freeciv-web project

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.

***********************************************************************/

var mapview_canvas_ctx = null;
var mapview_canvas = null;
var buffer_canvas_ctx = null;
var buffer_canvas = null;
var city_canvas_ctx = null;
var city_canvas = null;

var tileset_images = [];
var sprites = {};
var loaded_images = 0;

var sprites_init = false;

var canvas_text_font = "16px Helvetica, sans serif"; // with canvas text support

var fullfog = [];

var GOTO_DIR_DX = [0, 1, 2, -1, 1, -2, -1, 0];
var GOTO_DIR_DY = [-2, -1, 0, -1, 1, 0, 1, 2];
var dashedSupport = false;

// [0] line-edge borders, [1] main thick line, [2] tile way points, [3] inner way-point dot
var goto_colors_active = ["0,10,40,1","30,208,255,1","2,26,45,1","197,243,255,1"]; //active goto path
var goto_colors_info   = ["40,10,0,.91","255,208,30,.91","45,26,2,.91","255,243,197,.91"]; //tile/unit info

/**************************************************************************
  ...
**************************************************************************/
function init_mapview()
{

  $("#canvas_div").append($('<canvas/>', { id: 'canvas'}));

  /* Loads the two tileset definition files */
  $.ajax({
    url: "/javascript/2dcanvas/tileset_config_amplio2.js",
    dataType: "script",
    async: false
  }).fail(function() {
    console.error("Unable to load tileset config.");
  });

  $.ajax({
    url: "/javascript/2dcanvas/tileset_spec_amplio2.js",
    dataType: "script",
    async: false
  }).fail(function() {
    console.error("Unable to load tileset spec. Run Freeciv-img-extract.");
  });

  mapview_canvas = document.getElementById('canvas');
  mapview_canvas_ctx = mapview_canvas.getContext("2d");
  buffer_canvas = document.createElement('canvas');
  buffer_canvas_ctx = buffer_canvas.getContext('2d');

  if ("imageSmoothingEnabled" in mapview_canvas_ctx) {
    // if this Boolean value is false, images won't be smoothed when scaled. This property is true by default.
    mapview_canvas_ctx.imageSmoothingEnabled = false;
  }
  dashedSupport = ("setLineDash" in mapview_canvas_ctx);

  setup_window_size();

  mapview['gui_x0'] = 0;
  mapview['gui_y0'] = 0;



  /* Initialize fog array. */
  var i;
  for (i = 0; i < 81; i++) {
    /* Unknown, fog, known. */
    var ids = ['u', 'f', 'k'];
    var buf = "t.fog";
    var values = [];
    var j, k = i;

    for (j = 0; j < 4; j++) {
	  values[j] = k % 3;
	  k = Math.floor(k / 3);

      buf += "_" + ids[values[j]];

    }

    fullfog[i] = buf;
  }

  if (is_small_screen()) MAPVIEW_REFRESH_INTERVAL = 12;

  orientation_changed();
  init_sprites();
  requestAnimationFrame(update_map_canvas_check, mapview_canvas);

}


/**************************************************************************
  ...
**************************************************************************/
function is_small_screen()
{
  if ($(window).width() <= 640 || $(window).height() <= 590) {
    return true;
  } else {
    return false;
  }

}

/**************************************************************************
  This will load the tileset, blocking the UI while loading.
**************************************************************************/
function init_sprites()
{
  $.blockUI({ message: "<h1>Freeciv-web is loading. Please wait..."
	  + "<br><center><img src='/images/loading.gif'></center></h1>" });

  if (loaded_images != tileset_image_count) {
    for (var i = 0; i < tileset_image_count; i++) {
      var tileset_image = new Image();
      tileset_image.onload = preload_check;
      tileset_image.src = '/tileset/freeciv-web-tileset-'
                          + tileset_name + '-' + i + get_tileset_file_extention() + '?ts=' + ts;
      tileset_images[i] = tileset_image;
    }
  } else {
    // already loaded
    if (renderer == RENDERER_WEBGL) {
      webgl_preload();
    } else {
      $.unblockUI();
    }
  }

}

/**************************************************************************
  Determines when the whole tileset has been preloaded.
**************************************************************************/
function preload_check()
{
  loaded_images += 1;

  if (loaded_images == tileset_image_count) {
    init_cache_sprites();
    if (renderer == RENDERER_WEBGL) {
      webgl_preload();
    } else {
      $.unblockUI();
    }
  }
}

/**************************************************************************
  ...
**************************************************************************/
function init_cache_sprites()
{
 try {

  if (typeof tileset === 'undefined') {
    swal("Tileset not generated correctly. Run sync.sh in "
          + "freeciv-img-extract and recompile.");
    return;
  }

  for (var tile_tag in tileset) {
    var x = tileset[tile_tag][0];
    var y = tileset[tile_tag][1];
    var w = tileset[tile_tag][2];
    var h = tileset[tile_tag][3];
    var i = tileset[tile_tag][4];

    var newCanvas = document.createElement('canvas');
    newCanvas.height = h;
    newCanvas.width = w;
    var newCtx = newCanvas.getContext('2d');

    newCtx.drawImage(tileset_images[i], x, y,
                       w, h, 0, 0, w, h);
    sprites[tile_tag] = newCanvas;

  }

  sprites_init = true;
  tileset_images[0] = null;
  tileset_images[1] = null;
  tileset_images = null;

 }  catch(e) {
  console.log("Problem caching sprite: " + tile_tag);
 }

}

/**************************************************************************
  ...
**************************************************************************/
function mapview_window_resized ()
{
  // prevent the glitch: window resizing caused scrolling up the chatbox
  chatbox_scroll_to_bottom(false); 

  if (active_city != null || !resize_enabled) return;
  setup_window_size();
  if (renderer == RENDERER_2DCANVAS) update_map_canvas_full();
}

/**************************************************************************
  ...
**************************************************************************/
function drawPath(ctx, x1, y1, x2, y2, x3, y3, x4, y4)
{
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.lineTo(x4, y4);
    ctx.lineTo(x1, y1);
}

/**************************************************************************
  ...
**************************************************************************/
function mapview_put_tile(pcanvas, tag, canvas_x, canvas_y) {
  if (sprites[tag] == null) {
    //console.log("Missing sprite " + tag);
    return;
  }

  pcanvas.drawImage(sprites[tag], canvas_x, canvas_y);
}



/**************************************************************************
  same as mapview_put_tile but scales the image drawn
**************************************************************************/
function mapview_put_scaled_image(pcanvas, tag, canvas_x, canvas_y, scale)
{
  if (sprites[tag] == null) {
    //console.log("Missing sprite " + tag);
    return;
  }

  pcanvas.drawImage(sprites[tag], canvas_x, canvas_y, sprites[tag].width * scale, sprites[tag].height * scale);
}

/****************************************************************************
  Draw a filled-in colored rectangle onto the mapview or citydialog canvas.
****************************************************************************/
function canvas_put_rectangle(canvas_context, pcolor, canvas_x, canvas_y, width, height)
{
  canvas_context.fillStyle = pcolor;
  canvas_context.fillRect (canvas_x, canvas_y, canvas_x + width, canvas_y + height);

}

/****************************************************************************
  Draw a colored rectangle onto the mapview.
****************************************************************************/
function canvas_put_select_rectangle(canvas_context, canvas_x, canvas_y, width, height)
{
  canvas_context.beginPath();
  canvas_context.strokeStyle = "rgb(255,0,0)";
  canvas_context.rect(canvas_x, canvas_y, width, height);
  canvas_context.stroke();

}


/**************************************************************************
  Draw city text onto the canvas.
**************************************************************************/
function mapview_put_city_bar(pcanvas, city, canvas_x, canvas_y) {

  var airlift_text = "";   // City Airlift Counter
  const SRC_UNLIMITED = 4;   // bit value for SRC_UNLIMITED airliftingstyle
  const DEST_UNLIMITED = 8;  // bit value for DEST_UNLIMITED airliftingstyle
  const infinity_symbol = "%E2%88%9E";
  const left_div = "%E2%9D%AC";   // unicode <> dividers
  const right_div = "%E2%9D%AD";
  const bullet = "%E2%88%99";     // bullet
  var mood_text = "";      // City mood
  var size_color = "rgba(255, 255, 255, 1)";  // default white
  var size_shadow_color = "rgba(0, 0, 0, 1)"; // default black
  const peace = "%E2%98%AE ";
  const celeb = "%F0%9F%8E%89 ";  // 88 balloon, 89 party popper
  const disorder = "%E2%9C%8A ";
  const lose_celeb_color = "rgba(0,0,0,1)";
  const start_celeb_color = "rgb(128,255,128)";
  var start_celeb = false;  
  var lose_celeb = 0;  // uses 0,1 instead of false,true to also adjust inverted shadows to look better.

  // City mood:
  if (draw_city_mood) {
    if (client.conn.playing != null && !client_is_observer()) {
      if (city['owner'] == client.conn.playing.playerno) {
        var city_state = get_city_state(city);
        happy_people   = city['ppl_happy'][FEELING_FINAL];
        content_people = city['ppl_content'][FEELING_FINAL];
        unhappy_angry_people = city['ppl_unhappy'][FEELING_FINAL] + city['ppl_angry'][FEELING_FINAL];

        switch (city_state) {
          case "Peace":
            mood_text = peace;
            break;
          case "Disorder":
            mood_text = disorder;
            break;
          case "Celebrating": 
            mood_text = celeb;
            break;
        }
        if (happy_people >= city['size']*0.4999 && unhappy_angry_people==0 && city['size']>2)  {
          // case handling: city is going to celebrate next turn. 
          if (mood_text == peace) start_celeb = true;
        }
        else if (unhappy_angry_people > happy_people) { // case: city going into disorder          
          if (mood_text == celeb) { // if losing celebration, invert size color and size shadow
            size_shadow_color = "rgba(128,128,128,1)";
            size_color = lose_celeb_color;
            lose_celeb = 1;
          }
        }
        else { // case handling: city will go into peace next turn
          if (mood_text == celeb) { // if losing celebration, invert size color and size shadow
            size_shadow_color = "rgba(128,128,128,1)";
            size_color = lose_celeb_color;
            lose_celeb = 1;
          }
          else if (mood_text == peace) {
            mood_text = ""; // simplify: peace now+later = blank
          }
        }
      }
    }
  }

  // Airlift Counter
  if (draw_city_airlift_counter) {
    // source capacity = airlift counter (unless SRC_UNLIMITED==true, in which case it's infinite)
    var src_capacity = (game_info['airlifting_style'] & SRC_UNLIMITED) ? infinity_symbol : city['airlift'];
    if (src_capacity<0) src_capacity = 0;

    if (client.conn.playing != null && !client_is_observer()) {
      if (city['owner'] == client.conn.playing.playerno) {
        if (game_info['airlift_dest_divisor'] == 0) { // if no dest_divisor, there is one counter for both source and dest
          // show source airlifts if it has them, otherwise keep the label blank:
          airlift_text = ( city['airlift']>0 ? " "+left_div+src_capacity+right_div : "");
        } else if (city_has_building(city, improvement_id_by_name(B_AIRPORT_NAME))) {  
          // We get here if city has airport && airliftdestdivsor > 0. This means destination-airlifts has a separate counter
          var airlift_receive_text;  
          var airlift_receive_max_capacity = Math.round(city['size'] / game_info['airlift_dest_divisor']);

          if (game_info['airlifting_style'] & DEST_UNLIMITED) airlift_receive_text = infinity_symbol;  
          // else destination airlifts allowed = population of city / airliftdivisor, rounded to nearest whole number:   
          else airlift_receive_text = Math.max(0,city["airlift"] + airlift_receive_max_capacity - effects[1][0]['effect_value']);             
          
          airlift_text = (city['airlift']>0  ||  airlift_receive_text==infinity_symbol  || src_capacity==infinity_symbol || airlift_receive_text != "0")  
                          ? " "+left_div + src_capacity + bullet + airlift_receive_text + right_div  
                          : " "+left_div + bullet + right_div ;  
        }
      }
    }
  }

  var text = decodeURIComponent(city['name'] + airlift_text).toUpperCase();
  if (replace_capital_i) text = text.replace(/I/gi, "|");  // option to fix midget capital I for some bad sans-serif fonts
  var size = decodeURIComponent(mood_text + city['size']);
  var color = nations[city_owner(city)['nation']]['color'];
  var prod_type = get_city_production_type(city);

  var txt_measure = pcanvas.measureText(text);

  var size_measure = pcanvas.measureText(size);
  pcanvas.globalAlpha = 0.7;
  pcanvas.fillStyle = "rgba(0, 0, 0, 0.55)";
  pcanvas.fillRect (canvas_x - Math.floor(txt_measure.width / 2) - 14, canvas_y - 17,
                    txt_measure.width + 20, 20);

  pcanvas.fillStyle = color;
  pcanvas.fillRect(canvas_x + Math.floor(txt_measure.width / 2) + 5, canvas_y - 19,
               (prod_type != null) ? size_measure.width + 35 : size_measure.width + 8, 24);

  var city_flag = get_city_flag_sprite(city);
  pcanvas.drawImage(sprites[city_flag['key']],
              canvas_x - Math.floor(txt_measure.width / 2) - 45, canvas_y - 17);

  pcanvas.drawImage(sprites[get_city_occupied_sprite(city)],
              canvas_x - Math.floor(txt_measure.width / 2) - 12, canvas_y - 16);

  pcanvas.strokeStyle = color;
  pcanvas.lineWidth = 1.5;
  pcanvas.beginPath();
  pcanvas.moveTo(canvas_x - Math.floor(txt_measure.width / 2) - 46, canvas_y - 18);
  pcanvas.lineTo(canvas_x + Math.floor(txt_measure.width / 2) + size_measure.width + 13,
                 canvas_y - 18);
  pcanvas.moveTo(canvas_x + Math.floor(txt_measure.width / 2) + size_measure.width + 13,
                 canvas_y + 4);
  pcanvas.lineTo(canvas_x - Math.floor(txt_measure.width / 2) - 46, canvas_y + 4);
  pcanvas.lineTo(canvas_x - Math.floor(txt_measure.width / 2) - 46, canvas_y - 18);
  pcanvas.moveTo(canvas_x - Math.floor(txt_measure.width / 2) - 15, canvas_y - 17);
  pcanvas.lineTo(canvas_x - Math.floor(txt_measure.width / 2) - 15, canvas_y + 3);
  pcanvas.stroke();

  pcanvas.globalAlpha = 1.0;

  if (prod_type != null) {
    var tag = tileset_ruleset_entity_tag_str_or_alt(prod_type,
                                                    "unit or building");
    if (tag == null) return;
    pcanvas.drawImage(sprites[tag],
              canvas_x + Math.floor(txt_measure.width / 2) + size_measure.width + 13,
              canvas_y - 19, 28, 24);
  }

  // shadow text
  pcanvas.fillStyle = "rgba(40, 40, 40, 1)";
  pcanvas.fillText(text, canvas_x - Math.floor(txt_measure.width / 2)     , canvas_y + 1);
  pcanvas.fillStyle = size_shadow_color; // "rgba(0, 0, 0, 1)";
  pcanvas.fillText(size, canvas_x + Math.floor(txt_measure.width / 2) + 10 - lose_celeb, canvas_y + 1 - lose_celeb);

  // text on top of shadows
  pcanvas.fillStyle = "rgba(255, 255, 255, 1)";
  pcanvas.fillText(text, canvas_x - Math.floor(txt_measure.width / 2) - 2, canvas_y - 1);
  pcanvas.fillStyle = size_color;
  pcanvas.fillText(size, canvas_x + Math.floor(txt_measure.width / 2) + 8, canvas_y - 1);
  
  if (start_celeb) {
    mood_text = decodeURIComponent(mood_text); // only do when needed - performance
    pcanvas.fillStyle = start_celeb_color;
    pcanvas.fillText(mood_text, canvas_x + Math.floor(txt_measure.width / 2) + 8, canvas_y - 1);
  }
}

/**************************************************************************
  Draw tile label onto the canvas.
**************************************************************************/
function mapview_put_tile_label(pcanvas, tile, canvas_x, canvas_y) {
  var text = tile['label'];
  if (text != null && text.length > 0) {
    var txt_measure = pcanvas.measureText(text);

    pcanvas.fillStyle = "rgba(255, 255, 255, 1)";
    pcanvas.fillText(text, canvas_x + normal_tile_width / 2 - Math.floor(txt_measure.width / 2), canvas_y - 1);
  }
}

/**************************************************************************
  Renders the national border lines onto the canvas.
**************************************************************************/
function mapview_put_border_line(pcanvas, dir, color, canvas_x, canvas_y) {
  var x = canvas_x + 47;
  var y = canvas_y + 3;
  pcanvas.strokeStyle = color;
  pcanvas.beginPath();

  if (dir == DIR8_NORTH) {
    pcanvas.moveTo(x, y - 2, x + (tileset_tile_width / 2));
    pcanvas.lineTo(x + (tileset_tile_width / 2),  y + (tileset_tile_height / 2) - 2);
  } else if (dir == DIR8_EAST) {
    pcanvas.moveTo(x - 3, y + tileset_tile_height - 3);
    pcanvas.lineTo(x + (tileset_tile_width / 2) - 3,  y + (tileset_tile_height / 2) - 3);
  } else if (dir == DIR8_SOUTH) {
    pcanvas.moveTo(x - (tileset_tile_width / 2) + 3, y + (tileset_tile_height / 2) - 3);
    pcanvas.lineTo(x + 3,  y + tileset_tile_height - 3);
  } else if (dir == DIR8_WEST) {
    pcanvas.moveTo(x - (tileset_tile_width / 2) + 3, y + (tileset_tile_height / 2) - 3);
    pcanvas.lineTo(x + 3,  y - 3);
  }
  pcanvas.closePath();
  pcanvas.stroke();

}

/**************************************************************************
  Renders the national border lines onto the canvas.
**************************************************************************/
function mapview_territory_fill(pcanvas, color, canvas_x, canvas_y) {
  var x = canvas_x + 47;
  var y = canvas_y + 25;

  pcanvas.beginPath();
  pcanvas.fillStyle = color;
/*
  pcanvas.moveTo(x, y - 2, x + (tileset_tile_width / 2));
  pcanvas.lineTo(x + (tileset_tile_width / 2),  y + (tileset_tile_height / 2) - 2);
  //pcanvas.moveTo(x - 3, y + tileset_tile_height - 3);
  pcanvas.lineTo(x + (tileset_tile_width / 2) - 3,  y + (tileset_tile_height / 2) - 3);
  //pcanvas.moveTo(x - (tileset_tile_width / 2) + 3, y + (tileset_tile_height / 2) - 3);
  pcanvas.lineTo(x + 3,  y + tileset_tile_height - 3);
  //pcanvas.moveTo(x - (tileset_tile_width / 2) + 3, y + (tileset_tile_height / 2) - 3);
  pcanvas.lineTo(x + 3,  y - 3);*/

  pcanvas.moveTo(x,  y + (tileset_tile_height / 2));
  pcanvas.lineTo(x - (tileset_tile_width / 2),  y);
  pcanvas.lineTo(x,  y - (tileset_tile_height / 2));
  pcanvas.lineTo(x + (tileset_tile_width / 2),  y);
  pcanvas.lineTo(x,  y + (tileset_tile_height / 2));

  pcanvas.closePath();
  pcanvas.fill();
}


/**************************************************************************
...
**************************************************************************/
function mapview_put_goto_line(pcanvas, dir, canvas_x, canvas_y)
{
  var x0 = canvas_x + (tileset_tile_width / 2);
  var y0 = canvas_y + (tileset_tile_height / 2);
  var x1 = x0 + GOTO_DIR_DX[dir] * (tileset_tile_width / 2);
  var y1 = y0 + GOTO_DIR_DY[dir] * (tileset_tile_height / 2);

  // Use colours according to active goto or tile/unit info
  var colors = goto_active ? goto_colors_active : goto_colors_info; 

  // Line edges
  pcanvas.strokeStyle = 'rgba('+colors[0]+')';
  pcanvas.lineWidth = 8;
  pcanvas.lineCap = "round";
  pcanvas.beginPath();
  pcanvas.moveTo(x0, y0);
  pcanvas.lineTo(x1, y1);
  pcanvas.stroke();
  // Main cyan line
  pcanvas.strokeStyle = 'rgba('+colors[1]+')';
  pcanvas.lineWidth = 6;
  pcanvas.beginPath();
  pcanvas.moveTo(x0, y0);
  pcanvas.lineTo(x1, y1);
  pcanvas.stroke();
  // Waypoint circles
  pcanvas.lineWidth = 12;
  pcanvas.strokeStyle = 'rgba('+colors[2]+')';
  pcanvas.beginPath();
  pcanvas.moveTo(x0, y0);
  pcanvas.lineTo(x0, y0);
  pcanvas.stroke();
  pcanvas.beginPath();
  pcanvas.moveTo(x1, y1);
  pcanvas.lineTo(x1, y1);
  pcanvas.stroke();
  // Waypoint inner dots
  pcanvas.lineWidth = 4;
  pcanvas.strokeStyle = 'rgba('+colors[3]+')';
  pcanvas.lineCap = "square";
  pcanvas.beginPath();
  pcanvas.moveTo(x0, y0);
  pcanvas.lineTo(x0, y0);
  pcanvas.stroke();
  pcanvas.beginPath();
  pcanvas.moveTo(x1, y1);
  pcanvas.lineTo(x1, y1);
  pcanvas.stroke();
}

/**************************************************************************
  Hide compass temporarily if clicked (convenience measure)
**************************************************************************/
function compass_click()
{
  $("#compass").hide();
}

/**************************************************************************
  ...
**************************************************************************/
function set_city_mapview_active()
{
  city_canvas = document.getElementById('city_canvas');
  if (city_canvas == null) return;
  city_canvas_ctx = city_canvas.getContext('2d');
  city_canvas_ctx.font = canvas_text_font;

  mapview_canvas_ctx = city_canvas.getContext("2d");

  mapview['width'] = 350;
  mapview['height'] = 175;
  mapview['store_width'] = 350;
  mapview['store_height'] = 175;

  set_default_mapview_inactive();

}

/**************************************************************************
  ...
**************************************************************************/
function set_default_mapview_inactive()
{
  $("#compass").hide();

  if (overview_active) $("#game_overview_panel").parent().hide();
  if (unitpanel_active) $("#game_unit_panel").parent().hide();
  if (chatbox_active) {
    $("#game_chatbox_panel").parent().hide();
    $(".mobile_chatbox_dialog").hide();
  }
  //mapview_active = false;
}


/**************************************************************************
  ...
**************************************************************************/
function set_default_mapview_active()
{
  //mapview_active = true;
  //update_map_canvas_check(); // immediately refresh stale map and restart the interval to redraw map

  $("#warcalc_tab").hide();  // hide Odds tab

  if (show_compass) $("#compass").show();
  else $("#compass").hide();

  if (renderer == RENDERER_2DCANVAS) {
    mapview_canvas_ctx = mapview_canvas.getContext("2d");
    mapview_canvas_ctx.font = canvas_text_font;
  }

  var active_tab = $('#tabs').tabs('option', 'active');
  if (active_tab == TAB_CITIES) { // cities dialog is active
    return;
  }

  if (!is_small_screen() && overview_active) {
    $("#game_overview_panel").parent().show();
    $(".overview_dialog").position({my: 'left bottom', at: 'left bottom', of: window, within: $("#tabs-map")});
    if (overview_current_state == "minimized") $("#game_overview_panel").dialogExtend("minimize");
  }

  if (unitpanel_active) {
    update_active_units_dialog();
  }

  if (chatbox_active) {
    $("#game_chatbox_panel").parent().show();
    $(".mobile_chatbox_dialog").show();
    if (current_message_dialog_state == "minimized") $("#game_chatbox_panel").dialogExtend("minimize");
  }

  $("#tabs").tabs("option", "active", 0);
  $("#tabs-map").height("auto");

  tech_dialog_active = false;
  allow_right_click = false;
  keyboard_input = true;

  chatbox_scroll_to_bottom(false);
}

/**************************************************************************
 Initializes mapview sliding. This is done by rendering the area to scroll
 across to a new canvas (buffer_canvas), and clip a region of this
 buffer_canvas to the mapview canvas so it looks like scrolling.
**************************************************************************/
function enable_mapview_slide(ptile)
{
  var r = map_to_gui_pos(ptile['x'], ptile['y']);
  var gui_x = r['gui_dx'];
  var gui_y = r['gui_dy'];

  gui_x -= (mapview['width'] - tileset_tile_width) >> 1;
  gui_y -= (mapview['height'] - tileset_tile_height) >> 1;

  var dx = gui_x - mapview['gui_x0'];
  var dy = gui_y - mapview['gui_y0'];
  mapview_slide['dx'] = dx;
  mapview_slide['dy'] = dy;
  mapview_slide['i'] = mapview_slide['max'];
  mapview_slide['start'] = new Date().getTime();

  if ((dx == 0 && dy == 0) || mapview_slide['active']
      || Math.abs(dx) > mapview['width'] || Math.abs(dy) > mapview['height']) {
    // sliding across map edge: don't slide, just go there directly.
    mapview_slide['active'] = false;
    update_map_canvas_full();
    return;
  }

  mapview_slide['active'] = true;

  var new_width = mapview['width'] + Math.abs(dx);
  var new_height = mapview['height'] + Math.abs(dy);
  var old_width = mapview['store_width'];
  var old_height = mapview['store_height'];

  mapview_canvas = buffer_canvas;
  mapview_canvas_ctx = buffer_canvas_ctx;

  if (dx >= 0 && dy <= 0) {
    mapview['gui_y0'] -= Math.abs(dy);
  } else if (dx <= 0 && dy >= 0) {
    mapview['gui_x0'] -= Math.abs(dx);
  }  else if (dx <= 0 && dy <= 0) {
    mapview['gui_x0'] -= Math.abs(dx);
    mapview['gui_y0'] -= Math.abs(dy);
  }

  mapview['store_width'] = new_width;
  mapview['store_height'] = new_height;
  mapview['width'] = new_width;
  mapview['height'] = new_height;

  /* redraw mapview on large back buffer. */
  if (dx >= 0 && dy >= 0) {
    update_map_canvas(old_width, 0, dx, new_height);
    update_map_canvas(0, old_height, old_width, dy);
  } else if (dx <= 0 && dy <= 0) {
    update_map_canvas(0, 0, Math.abs(dx), new_height);
    update_map_canvas(Math.abs(dx), 0, old_width, Math.abs(dy));
  } else if (dx <= 0 && dy >= 0) {
    update_map_canvas(0, 0, Math.abs(dx), new_height);
    update_map_canvas(Math.abs(dx), old_height, old_width, Math.abs(dy));
  } else if (dx >= 0 && dy <= 0) {
    update_map_canvas(0, 0, new_width, Math.abs(dy));
    update_map_canvas(old_width, Math.abs(dy), Math.abs(dx), old_height);
  }

  /* restore default mapview. */
  mapview_canvas = document.getElementById('canvas');
  mapview_canvas_ctx = mapview_canvas.getContext("2d");

  if (dx >= 0 && dy >= 0) {
    buffer_canvas_ctx.drawImage(mapview_canvas, 0, 0, old_width, old_height, 0, 0, old_width, old_height);
  } else if (dx <= 0 && dy <= 0) {
    buffer_canvas_ctx.drawImage(mapview_canvas, 0, 0, old_width, old_height, Math.abs(dx), Math.abs(dy), old_width, old_height);
  } else if (dx <= 0 && dy >= 0) {
    buffer_canvas_ctx.drawImage(mapview_canvas, 0, 0, old_width, old_height, Math.abs(dx), 0, old_width, old_height);
  } else if (dx >= 0 && dy <= 0) {
    buffer_canvas_ctx.drawImage(mapview_canvas, 0, 0, old_width, old_height, 0, Math.abs(dy), old_width, old_height);
  }
  mapview['store_width'] = old_width;
  mapview['store_height'] = old_height;
  mapview['width'] = old_width;
  mapview['height'] = old_height;

}
