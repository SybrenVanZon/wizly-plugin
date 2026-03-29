module.exports = {
    customSmartMatchers: [
        {
            name: 'smartZoomMatcher',
            enabled: true,
            filePattern: '*.html',
            regex: '/(?<button><button\\b[^>]*?(?:magic|\\[magic\\])="(?<magic>mgc\\.[^"]+)"[^>]*>)(?<content>[\\s\\S]*?)<\\/button>/gm',
            remove: true,
            matchOn: {
                matchPrefix: 'Z_',
                controlPrefix: 'V_'
            }
        }
    ]
};
