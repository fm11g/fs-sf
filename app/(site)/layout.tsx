import Link from 'next/link';

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div id="tpf-site">
      <style>{`
#tpf-site{container-type:inline-size;background:#f6f8fc;min-height:100vh;color:#111a33}
#tpf-site header{background:#0B1B3F;color:#fff}
#tpf-site header .in,#tpf-site .main{max-width:860px;margin:0 auto;padding:16px 20px}
#tpf-site header a{color:#fff;text-decoration:none;font-weight:900;font-size:20px}
#tpf-site header a span{color:#FFD400}
#tpf-site .main{padding-top:32px;padding-bottom:64px}
#tpf-site .card{display:grid;grid-template-columns:120px 1fr;gap:16px;background:#fff;border-radius:14px;padding:14px;margin-bottom:12px;text-decoration:none;color:inherit;border:1px solid #e3e7f1}
#tpf-site .card img{width:120px;height:120px;object-fit:cover;border-radius:10px}
#tpf-site .card h2{font-size:18px;margin:4px 0 6px;word-break:keep-all}
#tpf-site .card p{margin:0;color:#5b6684;font-size:14px;line-height:1.5}
#tpf-site article{background:#fff;border-radius:16px;padding:clamp(20px,5cqw,44px);border:1px solid #e3e7f1;line-height:1.8;font-size:17px;word-break:keep-all}
#tpf-site article h1{font-size:clamp(24px,4.2cqw,34px);line-height:1.35;margin:0 0 8px}
#tpf-site article h2{font-size:22px;margin:40px 0 12px;padding-left:12px;border-left:5px solid #FFD400}
#tpf-site article img{max-width:100%;border-radius:12px;display:block;margin:20px auto}
#tpf-site article table{width:100%;border-collapse:collapse;font-size:15px}
#tpf-site article th,#tpf-site article td{border:1px solid #e3e7f1;padding:10px}
#tpf-site article th{background:#f0f3fa}
#tpf-site .cta{display:block;text-align:center;background:#FFD400;color:#0B1B3F;font-weight:900;padding:18px;border-radius:14px;text-decoration:none;font-size:19px;margin:32px 0}
#tpf-site .meta{color:#6b7594;font-size:14px}
#tpf-site footer{color:#8a93ad;font-size:12px;text-align:center;padding:24px}
`}</style>
      <header><div className="in"><Link href="/">오늘의 <span>정책자금</span></Link></div></header>
      <div className="main">{children}</div>
      <footer>정책자금은 각 기관 심사에 따라 승인 여부·한도가 결정됩니다. 최신 공고는 기관 홈페이지에서 반드시 확인하세요.</footer>
    </div>
  );
}
