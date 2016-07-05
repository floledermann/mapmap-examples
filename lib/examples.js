function mapEl() {
    var script = document.currentScript;
    if (!script) {
        var scripts = document.getElementsByTagName( 'script' );
        script = scripts[ scripts.length - 1 ];
    }
    return script.parentNode.getElementsByTagName('svg')[0];
}

$(document).ready(function() {
    $('.map-wrapper script').each(function(){
        var $el = $(this);
        var code = $el.html().trim();
        code = code.replace('mapEl()',"'#mapElement'");
        code = code.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        code = code.split('\n');
        for (var i=0; i<code.length; i++) {
            var line = code[i];
            line = line.split('//');
            if (line.length > 1) {
                if (line[1][0] == '!') {
                    code[i] = '<b>' + line[0] + '</b>';
                }
            }
        }
        $el.parents('.map-example').find('pre.code.auto,pre.code').first().html(code.join('\n'));
    });
});