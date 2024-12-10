// logoAPI.js
class LogoAPI {
    constructor() {
        // Daha güvenilir CORS proxy kullanımı
        this.corsProxies = [
            'https://api.allorigins.win/raw?url=',
            'https://corsproxy.io/?',
            'https://cors-anywhere.herokuapp.com/'
        ];
    }

    async getLogo(domain) {
        try {
            const url = this.formatUrl(domain);
            const html = await this.fetchWithRetry(url);
            const logos = await this.extractHighQualityLogos(html, url);
            
            // En az bir logo bulunmalı
            if (logos.length === 0) {
                throw new Error('No high quality logos found');
            }

            return {
                success: true,
                timestamp: new Date().toISOString(),
                domain: domain,
                logos: this.filterBestLogos(logos)
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                domain: domain
            };
        }
    }

    async fetchWithRetry(url) {
        let lastError;
        
        for (const proxy of this.corsProxies) {
            try {
                const response = await fetch(proxy + url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });
                
                if (response.ok) {
                    return await response.text();
                }
            } catch (error) {
                lastError = error;
            }
        }
        
        throw lastError;
    }

    async extractHighQualityLogos(html, baseUrl) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const logos = [];

        // 1. Open Graph ve Twitter Card'lardan yüksek kaliteli logo arama
        const socialImages = [
            ...this.findSocialImages(doc, 'og:image'),
            ...this.findSocialImages(doc, 'twitter:image')
        ];
        
        for (const img of socialImages) {
            const dimensions = await this.getImageDimensions(img.url);
            if (this.isHighQualityImage(dimensions)) {
                logos.push({
                    ...img,
                    ...dimensions,
                    score: this.calculateImageScore(img, dimensions)
                });
            }
        }

        // 2. JSON-LD şemasından logo arama
        const schemaLogos = this.findSchemaLogos(doc);
        for (const logo of schemaLogos) {
            const dimensions = await this.getImageDimensions(logo.url);
            if (this.isHighQualityImage(dimensions)) {
                logos.push({
                    ...logo,
                    ...dimensions,
                    score: this.calculateImageScore(logo, dimensions)
                });
            }
        }

        // 3. Header ve ana içerikten yüksek kaliteli logo arama
        const contentImages = this.findContentImages(doc);
        for (const img of contentImages) {
            if (this.isLikelyLogo(img)) {
                const dimensions = await this.getImageDimensions(img.url);
                if (this.isHighQualityImage(dimensions)) {
                    logos.push({
                        ...img,
                        ...dimensions,
                        score: this.calculateImageScore(img, dimensions)
                    });
                }
            }
        }

        // URL'leri düzelt
        return logos.map(logo => ({
            ...logo,
            url: this.makeAbsoluteUrl(logo.url, baseUrl)
        }));
    }

    findSocialImages(doc, property) {
        const images = [];
        const tags = doc.querySelectorAll(`meta[property="${property}"], meta[name="${property}"]`);
        
        tags.forEach(tag => {
            const url = tag.content;
            if (url) {
                images.push({
                    url: url,
                    type: 'social',
                    source: property
                });
            }
        });

        return images;
    }

    findSchemaLogos(doc) {
        const logos = [];
        const scripts = doc.querySelectorAll('script[type="application/ld+json"]');

        scripts.forEach(script => {
            try {
                const data = JSON.parse(script.textContent);
                if (data.logo) {
                    logos.push({
                        url: data.logo,
                        type: 'schema',
                        source: 'schema.org'
                    });
                }
            } catch (e) {
                // JSON parse hatalarını yoksay
            }
        });

        return logos;
    }

    findContentImages(doc) {
        const images = [];
        const selectors = [
            'header img',
            '.logo img',
            '#logo img',
            'img[alt*="logo" i]',
            'img[src*="logo"]',
            '.header img',
            'img[class*="logo" i]'
        ];

        selectors.forEach(selector => {
            doc.querySelectorAll(selector).forEach(img => {
                if (img.src) {
                    images.push({
                        url: img.src,
                        type: 'content',
                        source: 'content',
                        alt: img.alt,
                        width: img.width,
                        height: img.height
                    });
                }
            });
        });

        return images;
    }

    async getImageDimensions(url) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                resolve({
                    width: img.width,
                    height: img.height
                });
            };
            img.onerror = () => {
                resolve({ width: 0, height: 0 });
            };
            img.src = url;
        });
    }

    isHighQualityImage({ width, height }) {
        // En az 100x100 piksel olmalı
        return width >= 100 && height >= 100;
    }

    isLikelyLogo(img) {
        const alt = (img.alt || '').toLowerCase();
        const url = img.url.toLowerCase();
        
        // Logo olma olasılığını kontrol et
        return (
            alt.includes('logo') ||
            url.includes('logo') ||
            (img.width >= 100 && img.width <= 500 && img.height >= 50 && img.height <= 200)
        );
    }

    calculateImageScore(img, dimensions) {
        let score = 0;

        // Boyut skoru
        if (dimensions.width >= 200 && dimensions.height >= 200) score += 5;
        else if (dimensions.width >= 100 && dimensions.height >= 100) score += 3;

        // Tip skoru
        if (img.type === 'schema') score += 4;
        if (img.type === 'social') score += 3;
        if (img.type === 'content') score += 2;

        // Alt text skoru
        if (img.alt && img.alt.toLowerCase().includes('logo')) score += 2;

        // URL skoru
        if (img.url.toLowerCase().includes('logo')) score += 2;

        return score;
    }

    filterBestLogos(logos) {
        // Skorlarına göre sırala
        const sortedLogos = logos.sort((a, b) => b.score - a.score);
        
        // En iyi 3 logoyu döndür
        return sortedLogos.slice(0, 3).map(logo => {
            // Gereksiz alanları temizle
            const { score, ...cleanLogo } = logo;
            return cleanLogo;
        });
    }

    formatUrl(domain) {
        return domain.startsWith('http') ? domain : `https://${domain}`;
    }

    makeAbsoluteUrl(url, baseUrl) {
        try {
            return new URL(url, baseUrl).href;
        } catch {
            return url;
        }
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