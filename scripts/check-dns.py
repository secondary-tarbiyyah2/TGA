"""DNS lookup diagnostic for check-learn-dns.yml — standalone script,
not an inline workflow heredoc, so it isn't at the mercy of YAML
block-scalar indentation (the mistake made twice already this session)."""
import dns.resolver

hosts = ["globalacademy.tarbiyyah.co.uk", "learn.globalacademy.tarbiyyah.co.uk", "tarbiyyah.co.uk"]
for host in hosts:
    print(f"--- {host} ---")
    for rtype in ["A", "NS", "CNAME"]:
        try:
            answers = dns.resolver.resolve(host, rtype)
            for a in answers:
                print(f"  {rtype}: {a}")
        except Exception as e:
            print(f"  {rtype}: {type(e).__name__}")
