// logoAPI.js
class LogoAPI {
    constructor() {
        this.corsProxy = 'https://cors-anywhere.herokuapp.com/';
    }

    async getLogo(domain) {
        try {
            const url = this.formatUrl(domain);
            const html = await this.fetchHtml(url);
            const logos = await this.extractLogos(html, url);
            
            return {
                success: true,
                timestamp: new Date().toISOString(),
                domain: domain,
                logos: this.rankLogos(logos)
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                domain: domain
            };
        }
    }

    formatUrl(domain) {
        return domain.startsWith('http') ? domain : `https://${domain}`;
    }

    async fetchHtml(url) {
        const response = await fetch(this.corsProxy + url, {
            headers: {
                'User-Agent': 'LogoAPI/1.0'
            }
        });
        return await response.text();
    }

    async extractLogos(html, baseUrl) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const logos = [];

        // Meta taglerden logo arama
        const metaLogos = this.findMetaLogos(doc);
        logos.push(...metaLogos);

        // Schema.org veri yapısından logo arama
        const schemaLogos = this.findSchemaLogos(doc);
        logos.push(...schemaLogos);

        // Header ve ana içerikten logo arama
        const contentLogos = this.findContentLogos(doc);
        logos.push(...contentLogos);

        // SVG logolar
        const svgLogos = this.findSvgLogos(doc);
        logos.push(...svgLogos);

        // URL'leri düzelt
        return logos.map(logo => ({
            ...logo,
            url: this.makeAbsoluteUrl(logo.url, baseUrl)
        }));
    }

    findMetaLogos(doc) {
        const logos = [];
        const metaSelectors = {
            'og:logo': 10,
            'og:image': 8,
            'twitter:image': 7,
            'msapplication-TileImage': 6,
            'application-name': 5
        };

        for (const [property, weight] of Object.entries(metaSelectors)) {
            const meta = doc.querySelector(`meta[property="${property}"], meta[name="${property}"]`);
            if (meta?.content) {
                logos.push({
                    url: meta.content,
                    type: 'meta',
                    source: property,
                    weight: weight,
                    features: this.analyzeImageUrl(meta.content)
                });
            }
        }

        return logos;
    }

    findSchemaLogos(doc) {
        const logos = [];
        const scripts = doc.querySelectorAll('script[type="application/ld+json"]');

        scripts.forEach(script => {
            try {
                const data = JSON.parse(script.textContent);
                if (data.logo || data.image) {
                    logos.push({
                        url: data.logo || data.image,
                        type: 'schema',
                        source: 'schema.org',
                        weight: 9,
                        features: this.analyzeImageUrl(data.logo || data.image)
                    });
                }
            } catch (e) {
                // JSON parse hatalarını görmezden gel
            }
        });

        return logos;
    }

    findContentLogos(doc) {
        const logos = [];
        const imgSelectors = [
            'header img[src*="logo"]',
            '.logo img',
            '#logo img',
            'img[alt*="logo" i]',
            'img[src*="logo"]'
        ];

        imgSelectors.forEach((selector, index) => {
            const images = doc.querySelectorAll(selector);
            images.forEach(img => {
                if (img.src) {
                    logos.push({
                        url: img.src,
                        type: 'content',
                        source: selector,
                        weight: 7 - index,
                        features: {
                            ...this.analyzeImageUrl(img.src),
                            ...this.analyzeImageElement(img)
                        }
                    });
                }
            });
        });

        return logos;
    }

    findSvgLogos(doc) {
        const logos = [];
        const svgElements = doc.querySelectorAll('svg');

        svgElements.forEach(svg => {
            if (this.isSvgLogo(svg)) {
                logos.push({
                    url: 'data:image/svg+xml,' + encodeURIComponent(svg.outerHTML),
                    type: 'svg',
                    source: 'inline-svg',
                    weight: 8,
                    features: {
                        width: svg.getAttribute('width'),
                        height: svg.getAttribute('height'),
                        viewBox: svg.getAttribute('viewBox')
                    }
                });
            }
        });

        return logos;
    }

    isSvgLogo(svg) {
        const parent = svg.closest('.logo, .header, #logo, header');
        const hasLogoClass = svg.classList.toString().toLowerCase().includes('logo');
        const isReasonableSize = svg.getAttribute('width') < 500 && svg.getAttribute('height') < 500;
        
        return (parent || hasLogoClass) && isReasonableSize;
    }

    analyzeImageUrl(url) {
        const features = {
            format: null,
            isVector: false,
            hasLogoInPath: false
        };

        if (typeof url === 'string') {
            const ext = url.split('.').pop().toLowerCase();
            features.format = ext;
            features.isVector = ['svg', 'eps', 'ai'].includes(ext);
            features.hasLogoInPath = url.toLowerCase().includes('logo');
        }

        return features;
    }

    analyzeImageElement(img) {
        return {
            width: img.getAttribute('width'),
            height: img.getAttribute('height'),
            alt: img.getAttribute('alt'),
            className: img.className,
            aspectRatio: img.width && img.height ? img.width / img.height : null
        };
    }

    makeAbsoluteUrl(url, baseUrl) {
        try {
            return new URL(url, baseUrl).href;
        } catch {
            return url;
        }
    }

    rankLogos(logos) {
        return logos
            .map(logo => {
                // Kalite skoru hesapla
                let score = logo.weight || 0;

                // Format bonusu
                if (logo.features.isVector) score += 3;
                if (logo.features.hasLogoInPath) score += 2;
                if (logo.type === 'schema') score += 2;
                if (logo.features.format === 'png') score += 1;

                // Aspect ratio kontrolü
                if (logo.features.aspectRatio) {
                    const ratio = logo.features.aspectRatio;
                    if (ratio >= 0.5 && ratio <= 2) score += 2;
                }

                return {
                    ...logo,
                    score: score
                };
            })
            .sort((a, b) => b.score - a.score)
            .map(logo => {
                // Score'u kaldır, sadece sıralama için kullanıldı
                const { score, ...rest } = logo;
                return rest;
            });
    }
}

// API endpoint işleyici
const params = new URLSearchParams(window.location.search);
const domain = params.get('domain');

if (domain) {
    const api = new LogoAPI();
    api.getLogo(domain).then(result => {
        document.body.textContent = JSON.stringify(result, null, 2);
    });
} else {
    document.body.textContent = JSON.stringify({
        success: false,
        error: "Domain parameter is required"
    }, null, 2);
}