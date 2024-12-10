// logoFinder.js
class LogoFinder {
    constructor() {
        this.sources = {
            // Google'ın resmi logo servisi
            google: (domain) => `https://www.google.com/s2/favicons?sz=256&domain=${domain}`,
            
            // Clearbit logo API
            clearbit: (domain) => `https://logo.clearbit.com/${domain}?size=512`,
            
            // BrandFetch API alternatifi
            brandfetch: (domain) => `https://asset.brandfetch.io/icons/${domain}`,
            
            // Alternatif logo kaynakları
            alternates: [
                (domain) => `https://${domain}/assets/images/logo.png`,
                (domain) => `https://${domain}/assets/logo.png`,
                (domain) => `https://${domain}/images/logo.png`,
                (domain) => `https://${domain}/logo.png`,
                (domain) => `https://${domain}/assets/img/logo.png`,
                (domain) => `https://${domain}/static/images/logo.png`
            ]
        };
    }

    async findLogo(domain) {
        try {
            // Domain formatını düzelt
            domain = this.formatDomain(domain);
            
            // Tüm olası logoları topla
            const possibleLogos = await this.collectPossibleLogos(domain);
            
            // Logo kontrolü ve sıralama
            const validLogos = await this.validateAndRankLogos(possibleLogos);

            if (validLogos.length > 0) {
                return {
                    success: true,
                    timestamp: new Date().toISOString(),
                    domain: domain,
                    logos: validLogos
                };
            } else {
                throw new Error('No valid logos found');
            }

        } catch (error) {
            return {
                success: false,
                error: error.message,
                domain: domain
            };
        }
    }

    formatDomain(domain) {
        // HTTP/HTTPS ve www. kaldır
        return domain.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '');
    }

    async collectPossibleLogos(domain) {
        const logos = [];

        // Ana kaynaklar
        logos.push({
            url: this.sources.google(domain),
            source: 'google',
            priority: 3,
            size: 256
        });

        logos.push({
            url: this.sources.clearbit(domain),
            source: 'clearbit',
            priority: 4,
            size: 512
        });

        logos.push({
            url: this.sources.brandfetch(domain),
            source: 'brandfetch',
            priority: 3,
            size: 256
        });

        // Alternatif kaynaklar
        this.sources.alternates.forEach((source, index) => {
            logos.push({
                url: source(domain),
                source: 'alternate',
                priority: 2,
                attemptIndex: index
            });
        });

        return logos;
    }

    async validateAndRankLogos(logos) {
        const validLogos = [];

        for (const logo of logos) {
            try {
                // Logo boyutlarını ve geçerliliğini kontrol et
                const dimensions = await this.checkImage(logo.url);
                
                if (dimensions.width >= 100 && dimensions.height >= 100) {
                    validLogos.push({
                        url: logo.url,
                        source: logo.source,
                        width: dimensions.width,
                        height: dimensions.height,
                        quality_score: this.calculateQualityScore(logo, dimensions)
                    });
                }
            } catch (error) {
                continue; // Geçersiz logoları atla
            }
        }

        // Kalite skoruna göre sırala ve en iyi 3 logoyu döndür
        return validLogos
            .sort((a, b) => b.quality_score - a.quality_score)
            .slice(0, 3);
    }

    calculateQualityScore(logo, dimensions) {
        let score = 0;

        // Boyut skoru
        score += Math.min(dimensions.width, 1000) / 200; // Max 5 puan
        
        // Kaynak güvenilirliği
        const sourceScores = {
            'clearbit': 5,
            'google': 4,
            'brandfetch': 4,
            'alternate': 3
        };
        score += sourceScores[logo.source] || 0;

        // Aspect ratio skoru (1'e yakın oranlar daha iyi)
        const ratio = dimensions.width / dimensions.height;
        const ratioScore = Math.abs(1 - ratio) < 0.3 ? 2 : 0;
        score += ratioScore;

        return Math.round(score * 10) / 10;
    }

    async checkImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            
            img.onload = () => {
                resolve({
                    width: img.width,
                    height: img.height,
                    valid: true
                });
            };
            
            img.onerror = () => reject(new Error('Invalid image'));
            
            img.src = url;
        });
    }
}

// API endpoint handler
const params = new URLSearchParams(window.location.search);
const domain = params.get('domain');

if (domain) {
    const finder = new LogoFinder();
    finder.findLogo(domain).then(result => {
        document.body.textContent = JSON.stringify(result, null, 2);
    });
} else {
    document.body.textContent = JSON.stringify({
        success: false,
        error: "Domain parameter is required"
    }, null, 2);
}