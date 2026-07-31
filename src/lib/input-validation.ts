/** Prevent a target-company website from being accidentally submitted as the
 * seller product, which otherwise makes a report header look plausible but
 * corrupts every downstream fit analysis. */
export function validateSellerProductName(productName: string, targetUrl: string): string | undefined {
  const value = productName.trim();
  if (!value) return "请填写我方产品名称。";
  if (!/^https?:\/\//i.test(value) && !/^www\./i.test(value)) return undefined;

  const productUrl = value.startsWith("http") ? value : `https://${value}`;
  try {
    const productHost = new URL(productUrl).hostname.replace(/^www\./i, "").toLowerCase();
    const targetHost = new URL(targetUrl).hostname.replace(/^www\./i, "").toLowerCase();
    if (productHost === targetHost) return "“我方产品”不能填写目标公司官网，请填写实际销售的产品或解决方案名称。";
  } catch {
    // A URL-shaped product value is still not a usable product name.
  }
  return "“我方产品”请填写产品或解决方案名称，不要填写网址。";
}
