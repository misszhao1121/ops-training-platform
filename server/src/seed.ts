import { getDb, get, run } from './db.js';
import { uid } from './util.js';
import { hashPassword } from './auth.js';
import { pathToFileURL } from 'node:url';

interface SeedCategory { name: string; slug: string; parent?: string; }
interface SeedQuestion {
  title: string;
  type: 'single_choice' | 'multiple_choice' | 'true_false' | 'fill_blank' | 'short_answer';
  difficulty: 'easy' | 'medium' | 'hard';
  category: string;
  tags: string[];
  options?: { key: string; text: string }[];
  answer: unknown;
  explanation?: string;
  knowledgePoint?: string;
  source?: string;
}

/**
 * 行业一级分类：系统按行业组织题库（运维 / 计算机 / 护理 / 金融……）。
 * 子分类通过 parent 挂到对应行业下，题目挂在子分类上。
 */
const INDUSTRIES: SeedCategory[] = [
  { name: '运维', slug: 'industry-ops' },
  { name: '计算机', slug: 'industry-cs' },
  { name: '护理', slug: 'industry-nursing' },
  { name: '金融', slug: 'industry-finance' },
];

const CATEGORIES: SeedCategory[] = [
  // ===== 运维行业 =====
  { name: 'Linux 系统', slug: 'linux', parent: 'industry-ops' },
  { name: '网络', slug: 'network', parent: 'industry-ops' },
  { name: '数据库', slug: 'database', parent: 'industry-ops' },
  { name: '容器与 Kubernetes', slug: 'container', parent: 'industry-ops' },
  { name: 'DevOps / 云平台', slug: 'devops', parent: 'industry-ops' },
  { name: '监控与日志', slug: 'monitoring', parent: 'industry-ops' },
  { name: '脚本与自动化', slug: 'scripting', parent: 'industry-ops' },
  { name: '安全', slug: 'security', parent: 'industry-ops' },
  // ===== 计算机行业 =====
  { name: '计算机基础', slug: 'cs-basic', parent: 'industry-cs' },
  { name: '编程语言', slug: 'programming', parent: 'industry-cs' },
  { name: '数据结构与算法', slug: 'dsa', parent: 'industry-cs' },
  // ===== 护理行业 =====
  { name: '基础护理', slug: 'nursing-basic', parent: 'industry-nursing' },
  { name: '内科护理', slug: 'nursing-internal', parent: 'industry-nursing' },
  // ===== 金融行业 =====
  { name: '金融基础', slug: 'finance-basic', parent: 'industry-finance' },
];

const TAGS = ['基础概念', '故障排查', '面试高频', '生产经验'];

const QUESTIONS: SeedQuestion[] = [
  // ===== Linux =====
  {
    title: '以下哪个命令用于查看当前系统的进程快照（一次性输出）？',
    type: 'single_choice', difficulty: 'easy', category: 'linux', tags: ['基础概念', '面试高频'],
    options: [
      { key: 'A', text: 'top' },
      { key: 'B', text: 'ps' },
      { key: 'C', text: 'df' },
      { key: 'D', text: 'du' },
    ],
    answer: 'B',
    explanation: 'ps 输出进程快照；top 是实时动态刷新；df 查看磁盘分区；du 统计目录/文件磁盘用量。',
    knowledgePoint: '进程管理', source: '面试高频',
  },
  {
    title: '把文件权限设置为 rwxr-xr-x，对应的数字模式是？',
    type: 'single_choice', difficulty: 'easy', category: 'linux', tags: ['基础概念'],
    options: [
      { key: 'A', text: '644' },
      { key: 'B', text: '755' },
      { key: 'C', text: '777' },
      { key: 'D', text: '700' },
    ],
    answer: 'B',
    explanation: 'rwx=4+2+1=7，r-x=4+1=5，故为 755。',
    knowledgePoint: '文件权限',
  },
  {
    title: '查看磁盘分区整体使用情况的命令是？',
    type: 'single_choice', difficulty: 'easy', category: 'linux', tags: ['基础概念'],
    options: [
      { key: 'A', text: 'du -sh' },
      { key: 'B', text: 'df -h' },
      { key: 'C', text: 'free -h' },
      { key: 'D', text: 'lsblk' },
    ],
    answer: 'B',
    explanation: 'df -h 以人类可读方式查看文件系统磁盘使用；free 看内存；du 看目录大小。',
    knowledgePoint: '磁盘管理',
  },
  {
    title: '在文件中查找包含某个关键字的行，应使用哪个命令？',
    type: 'single_choice', difficulty: 'easy', category: 'linux', tags: ['基础概念', '面试高频'],
    options: [
      { key: 'A', text: 'find' },
      { key: 'B', text: 'grep' },
      { key: 'C', text: 'locate' },
      { key: 'D', text: 'which' },
    ],
    answer: 'B',
    explanation: 'grep 按正则匹配文件内容；find/locate 按文件名查找文件。',
    knowledgePoint: '文本处理',
  },
  {
    title: '创建符号链接（软链接）的命令是？',
    type: 'single_choice', difficulty: 'easy', category: 'linux', tags: ['基础概念'],
    options: [
      { key: 'A', text: 'ln' },
      { key: 'B', text: 'ln -s' },
      { key: 'C', text: 'ln -d' },
      { key: 'D', text: 'ln -f' },
    ],
    answer: 'B',
    explanation: 'ln -s 创建软链接；不带 -s 的 ln 创建硬链接。',
    knowledgePoint: '文件系统',
  },
  {
    title: '以下哪些命令可用于观察系统 CPU/内存/IO 等资源使用情况？（多选）',
    type: 'multiple_choice', difficulty: 'medium', category: 'linux', tags: ['故障排查', '生产经验'],
    options: [
      { key: 'A', text: 'top' },
      { key: 'B', text: 'vmstat' },
      { key: 'C', text: 'iostat' },
      { key: 'D', text: 'free' },
    ],
    answer: ['A', 'B', 'C', 'D'],
    explanation: 'top 看实时进程与负载；vmstat 看虚拟内存/CPU；iostat 看磁盘 IO；free 看内存。',
    knowledgePoint: '性能观察',
  },
  {
    title: '显示当前内核版本信息的命令是（填写命令，可带参数）：',
    type: 'fill_blank', difficulty: 'medium', category: 'linux', tags: ['基础概念'],
    answer: ['uname -r', 'uname -a', 'uname'],
    explanation: 'uname -r 仅显示内核版本；uname -a 显示全部系统信息。',
    knowledgePoint: '系统信息',
  },
  {
    title: '一个进程已结束但仍在进程表中占用 PID、无法回收，这种进程称为____进程。',
    type: 'fill_blank', difficulty: 'medium', category: 'linux', tags: ['故障排查'],
    answer: ['僵尸', 'zombie'],
    explanation: '子进程退出后父进程未调用 wait() 回收，就变成僵尸进程，其资源大部分已释放，仅保留进程表项。',
    knowledgePoint: '进程状态',
  },
  {
    title: 'kill -9 发送的 SIGKILL 信号可以被进程捕获并忽略。',
    type: 'true_false', difficulty: 'easy', category: 'linux', tags: ['基础概念'],
    answer: false,
    explanation: 'SIGKILL(9) 和 SIGSTOP 不能被捕获、阻塞或忽略，由内核直接终止进程。',
    knowledgePoint: '信号机制',
  },
  {
    title: '以下哪些信号可以被进程自定义捕获处理？（多选）',
    type: 'multiple_choice', difficulty: 'hard', category: 'linux', tags: ['基础概念', '面试高频'],
    options: [
      { key: 'A', text: 'SIGTERM (15)' },
      { key: 'B', text: 'SIGINT (2)' },
      { key: 'C', text: 'SIGHUP (1)' },
      { key: 'D', text: 'SIGKILL (9)' },
    ],
    answer: ['A', 'B', 'C'],
    explanation: 'SIGKILL 与 SIGSTOP 不可捕获；其余大多可捕获，常用于优雅退出（SIGTERM）。',
    knowledgePoint: '信号机制',
  },
  {
    title: '某服务报「address already in use」，最可能是哪种原因？',
    type: 'single_choice', difficulty: 'medium', category: 'linux', tags: ['故障排查', '生产经验'],
    options: [
      { key: 'A', text: '端口被其它进程占用' },
      { key: 'B', text: '磁盘空间不足' },
      { key: 'C', text: '内存溢出' },
      { key: 'D', text: 'CPU 满载' },
    ],
    answer: 'A',
    explanation: 'address already in use 表示监听端口已被占用，可用 ss -tlnp 或 lsof -i:端口 定位占用进程。',
    knowledgePoint: '端口排查',
  },

  // ===== 网络 =====
  {
    title: '用于测试到目标主机网络连通性的命令是？',
    type: 'single_choice', difficulty: 'easy', category: 'network', tags: ['基础概念'],
    options: [
      { key: 'A', text: 'ping' },
      { key: 'B', text: 'traceroute' },
      { key: 'C', text: 'telnet' },
      { key: 'D', text: 'curl' },
    ],
    answer: 'A',
    explanation: 'ping 基于 ICMP 测试连通性；traceroute 看路径；telnet/curl 常用于测试端口与服务。',
    knowledgePoint: '连通性测试',
  },
  {
    title: '查看本机路由表的命令是？',
    type: 'single_choice', difficulty: 'medium', category: 'network', tags: ['基础概念'],
    options: [
      { key: 'A', text: 'ip route 或 route -n' },
      { key: 'B', text: 'ip addr' },
      { key: 'C', text: 'ss -tlnp' },
      { key: 'D', text: 'netstat -i' },
    ],
    answer: 'A',
    explanation: 'ip route / route -n 查看路由表；ip addr 看地址；ss -tlnp 看监听端口。',
    knowledgePoint: '路由',
  },
  {
    title: '查看当前系统所有监听中的 TCP 端口及对应进程，最合适的命令是？',
    type: 'single_choice', difficulty: 'medium', category: 'network', tags: ['故障排查'],
    options: [
      { key: 'A', text: 'ss -tlnp' },
      { key: 'B', text: 'ifconfig' },
      { key: 'C', text: 'ping -a' },
      { key: 'D', text: 'arp -a' },
    ],
    answer: 'A',
    explanation: 'ss -tlnp 显示 TCP 监听端口及进程；netstat -tlnp 是传统等价命令。',
    knowledgePoint: '端口查看',
  },
  {
    title: 'TCP 连接中 TIME_WAIT 状态出现在哪一方？',
    type: 'single_choice', difficulty: 'hard', category: 'network', tags: ['面试高频', '生产经验'],
    options: [
      { key: 'A', text: '主动发起关闭的一方' },
      { key: 'B', text: '被动关闭的一方' },
      { key: 'C', text: '双方都会出现' },
      { key: 'D', text: '仅客户端出现' },
    ],
    answer: 'A',
    explanation: '主动关闭方发出最后一个 ACK 后进入 TIME_WAIT，等待 2MSL，用于保证对端收到 ACK 并让旧报文失效。',
    knowledgePoint: 'TCP 状态机',
  },
  {
    title: 'TCP 建立连接需要经过几次握手？',
    type: 'single_choice', difficulty: 'easy', category: 'network', tags: ['基础概念', '面试高频'],
    options: [
      { key: 'A', text: '2 次' },
      { key: 'B', text: '3 次' },
      { key: 'C', text: '4 次' },
      { key: 'D', text: '1 次' },
    ],
    answer: 'B',
    explanation: 'TCP 建立连接三次握手（SYN → SYN-ACK → ACK），断开连接四次挥手。',
    knowledgePoint: 'TCP 握手',
  },
  {
    title: '以下哪些属于 OSI 传输层协议？（多选）',
    type: 'multiple_choice', difficulty: 'medium', category: 'network', tags: ['基础概念'],
    options: [
      { key: 'A', text: 'TCP' },
      { key: 'B', text: 'UDP' },
      { key: 'C', text: 'IP' },
      { key: 'D', text: 'HTTP' },
    ],
    answer: ['A', 'B'],
    explanation: 'TCP/UDP 是传输层；IP 是网络层；HTTP 是应用层。',
    knowledgePoint: '网络分层',
  },
  {
    title: '常用的 DNS 解析查询命令是（填写一个，小写）：',
    type: 'fill_blank', difficulty: 'medium', category: 'network', tags: ['故障排查'],
    answer: ['nslookup', 'dig', 'host'],
    explanation: 'nslookup / dig / host 均可做 DNS 查询；dig 输出更详细。',
    knowledgePoint: 'DNS',
  },
  {
    title: 'HTTP 状态码 502 Bad Gateway 的含义是？',
    type: 'single_choice', difficulty: 'medium', category: 'network', tags: ['故障排查', '生产经验'],
    options: [
      { key: 'A', text: '网关/代理从上游服务器收到了无效响应' },
      { key: 'B', text: '请求的资源不存在' },
      { key: 'C', text: '客户端未认证' },
      { key: 'D', text: '服务器内部错误' },
    ],
    answer: 'A',
    explanation: '502 表示反向代理（如 Nginx）从上游收到无效响应；404 是资源不存在；401 未认证；500 是服务器内部错误。',
    knowledgePoint: 'HTTP 状态码',
  },

  // ===== 数据库 =====
  {
    title: 'MySQL 默认监听端口是？',
    type: 'single_choice', difficulty: 'easy', category: 'database', tags: ['基础概念'],
    options: [
      { key: 'A', text: '3306' },
      { key: 'B', text: '5432' },
      { key: 'C', text: '6379' },
      { key: 'D', text: '27017' },
    ],
    answer: 'A',
    explanation: 'MySQL 默认 3306；PostgreSQL 5432；Redis 6379；MongoDB 27017。',
    knowledgePoint: '端口',
  },
  {
    title: 'Redis 默认监听端口是？',
    type: 'single_choice', difficulty: 'easy', category: 'database', tags: ['基础概念'],
    options: [
      { key: 'A', text: '6379' },
      { key: 'B', text: '3306' },
      { key: 'C', text: '11211' },
      { key: 'D', text: '9200' },
    ],
    answer: 'A',
    explanation: 'Redis 6379；Memcached 11211；Elasticsearch 9200。',
    knowledgePoint: '端口',
  },
  {
    title: '分析某条 SQL 的执行计划、判断是否走索引，应使用哪个关键字？',
    type: 'single_choice', difficulty: 'medium', category: 'database', tags: ['故障排查', '面试高频'],
    options: [
      { key: 'A', text: 'EXPLAIN' },
      { key: 'B', text: 'DESCRIBE' },
      { key: 'C', text: 'SHOW INDEX' },
      { key: 'D', text: 'ANALYZE' },
    ],
    answer: 'A',
    explanation: 'EXPLAIN 显示执行计划（type、key、rows 等）；SHOW INDEX 只看索引定义。',
    knowledgePoint: 'SQL 优化',
  },
  {
    title: '以下哪些写法可能导致 MySQL 索引失效？（多选）',
    type: 'multiple_choice', difficulty: 'hard', category: 'database', tags: ['面试高频', '生产经验'],
    options: [
      { key: 'A', text: "WHERE name LIKE '%张%'" },
      { key: 'B', text: '对索引列做函数运算，如 WHERE YEAR(create_time)=2024' },
      { key: 'C', text: '隐式类型转换，如字符串列与数字比较' },
      { key: 'D', text: 'WHERE id = 1' },
    ],
    answer: ['A', 'B', 'C'],
    explanation: '前导通配符 LIKE、对列做函数、隐式类型转换都会导致索引失效；等值查询通常能走索引。',
    knowledgePoint: '索引失效',
  },
  {
    title: 'Redis 是纯内存数据库，数据默认不会持久化到磁盘。',
    type: 'true_false', difficulty: 'easy', category: 'database', tags: ['基础概念'],
    answer: false,
    explanation: 'Redis 数据主要驻留内存，但支持 RDB 快照和 AOF 日志两种持久化方式，并非「默认完全不持久化」。',
    knowledgePoint: 'Redis 持久化',
  },
  {
    title: '如何排查 MySQL 连接数被占满的问题？请简述思路。',
    type: 'short_answer', difficulty: 'hard', category: 'database', tags: ['故障排查', '生产经验'],
    answer: '查看当前连接与最大连接数（SHOW VARIABLES LIKE "max_connections"、SHOW PROCESSLIST / information_schema.processlist），定位大量空闲或慢连接，检查应用连接池是否泄漏、是否缺少超时配置，必要时杀掉异常连接并优化应用。',
    explanation: '核心是定位连接来源：应用连接池泄漏、慢查询堆积、未关闭连接都是常见原因。',
    knowledgePoint: '连接池与故障定位',
  },

  // ===== 容器与 K8s =====
  {
    title: '根据 Dockerfile 构建镜像的命令是？',
    type: 'single_choice', difficulty: 'easy', category: 'container', tags: ['基础概念'],
    options: [
      { key: 'A', text: 'docker build' },
      { key: 'B', text: 'docker run' },
      { key: 'C', text: 'docker pull' },
      { key: 'D', text: 'docker commit' },
    ],
    answer: 'A',
    explanation: 'docker build 按 Dockerfile 构建；run 运行容器；pull 拉取镜像。',
    knowledgePoint: '镜像构建',
  },
  {
    title: '查看某个运行中容器的实时日志，应使用？',
    type: 'single_choice', difficulty: 'medium', category: 'container', tags: ['基础概念'],
    options: [
      { key: 'A', text: 'docker logs -f <容器>' },
      { key: 'B', text: 'docker inspect <容器>' },
      { key: 'C', text: 'docker ps' },
      { key: 'D', text: 'docker attach' },
    ],
    answer: 'A',
    explanation: 'docker logs -f 持续输出容器日志；inspect 看配置；ps 看容器列表。',
    knowledgePoint: '容器日志',
  },
  {
    title: 'Kubernetes 中最小的调度与部署单元是？',
    type: 'single_choice', difficulty: 'easy', category: 'container', tags: ['基础概念', '面试高频'],
    options: [
      { key: 'A', text: 'Pod' },
      { key: 'B', text: 'Deployment' },
      { key: 'C', text: 'Node' },
      { key: 'D', text: 'Container（单独部署）' },
    ],
    answer: 'A',
    explanation: 'Pod 是 K8s 最小调度单元，可包含一个或多个容器，共享网络与存储命名空间。',
    knowledgePoint: 'Pod',
  },
  {
    title: '以下哪些是 Kubernetes 的核心资源对象？（多选）',
    type: 'multiple_choice', difficulty: 'medium', category: 'container', tags: ['基础概念'],
    options: [
      { key: 'A', text: 'Pod' },
      { key: 'B', text: 'Deployment' },
      { key: 'C', text: 'Service' },
      { key: 'D', text: 'ConfigMap' },
    ],
    answer: ['A', 'B', 'C', 'D'],
    explanation: 'Pod 承载容器；Deployment 管理副本与滚动更新；Service 提供服务发现与负载均衡；ConfigMap 管理配置。',
    knowledgePoint: 'K8s 资源',
  },
  {
    title: '进入一个正在运行的容器并打开交互式 Shell，正确命令是？',
    type: 'single_choice', difficulty: 'medium', category: 'container', tags: ['故障排查'],
    options: [
      { key: 'A', text: 'docker exec -it <容器> /bin/bash' },
      { key: 'B', text: 'docker run -it <镜像>' },
      { key: 'C', text: 'docker start <容器>' },
      { key: 'D', text: 'docker logs <容器>' },
    ],
    answer: 'A',
    explanation: 'docker exec 在运行中的容器内执行命令，-it 提供交互终端。',
    knowledgePoint: '容器调试',
  },
  {
    title: '查看集群中所有命名空间下的 Pod，命令是（填写，小写）：',
    type: 'fill_blank', difficulty: 'medium', category: 'container', tags: ['基础概念'],
    answer: ['kubectl get pods -a', 'kubectl get pods --all-namespaces', 'kubectl get pod -a'],
    explanation: 'kubectl get pods -A / --all-namespaces 列出所有命名空间的 Pod。',
    knowledgePoint: 'kubectl',
  },
  {
    title: 'Docker 的 host 网络模式与宿主机共享网络命名空间。',
    type: 'true_false', difficulty: 'medium', category: 'container', tags: ['基础概念'],
    answer: true,
    explanation: 'host 模式下容器直接使用宿主机网络栈，端口无需映射，性能好但隔离性差。',
    knowledgePoint: 'Docker 网络',
  },
  {
    title: 'Kubernetes 中 Pod 一直处于 Pending 状态，最可能的排查方向是？',
    type: 'short_answer', difficulty: 'hard', category: 'container', tags: ['故障排查', '生产经验'],
    answer: '用 kubectl describe pod 查看 Events：常见原因是资源不足（CPU/内存/GPU 无节点可满足）、节点打满、PVC 未绑定、污点容忍或亲和性不满足、镜像拉取慢等，据此再决定扩容节点或调整调度。',
    explanation: 'Pending 表示已创建但未调度/未启动，describe 的 Events 字段是关键。',
    knowledgePoint: 'Pod 调度排查',
  },

  // ===== DevOps =====
  {
    title: '把最近一次 Git 提交撤销、但保留工作区改动，应使用？',
    type: 'single_choice', difficulty: 'medium', category: 'devops', tags: ['面试高频'],
    options: [
      { key: 'A', text: 'git reset --soft HEAD~1' },
      { key: 'B', text: 'git reset --hard HEAD~1' },
      { key: 'C', text: 'git revert HEAD' },
      { key: 'D', text: 'git checkout HEAD~1' },
    ],
    answer: 'A',
    explanation: '--soft 撤销提交但保留暂存区与工作区；--hard 会丢弃改动；revert 生成新的反向提交。',
    knowledgePoint: 'Git 版本回退',
  },
  {
    title: '查看当前 Git 工作区状态（哪些文件被修改/新增）的命令是？',
    type: 'single_choice', difficulty: 'easy', category: 'devops', tags: ['基础概念'],
    options: [
      { key: 'A', text: 'git status' },
      { key: 'B', text: 'git log' },
      { key: 'C', text: 'git diff --cached' },
      { key: 'D', text: 'git show' },
    ],
    answer: 'A',
    explanation: 'git status 显示工作区与暂存区状态；git log 看提交历史。',
    knowledgePoint: 'Git 基础',
  },
  {
    title: '以下哪些属于常见 CI/CD 工具或平台？（多选）',
    type: 'multiple_choice', difficulty: 'medium', category: 'devops', tags: ['基础概念'],
    options: [
      { key: 'A', text: 'Jenkins' },
      { key: 'B', text: 'GitLab CI' },
      { key: 'C', text: 'GitHub Actions' },
      { key: 'D', text: 'Prometheus' },
    ],
    answer: ['A', 'B', 'C'],
    explanation: '前三者都是 CI/CD；Prometheus 是监控系统，不属于 CI/CD。',
    knowledgePoint: 'CI/CD 工具',
  },
  {
    title: '蓝绿部署（Blue-Green）会同时运行新旧两套环境，通过切换流量完成发布。',
    type: 'true_false', difficulty: 'medium', category: 'devops', tags: ['生产经验'],
    answer: true,
    explanation: '蓝绿部署保留两套完整环境，验证新版本后一键切换流量，回滚快，但资源成本翻倍。',
    knowledgePoint: '发布策略',
  },
  {
    title: '与滚动更新相比，蓝绿部署最突出的优点是？',
    type: 'single_choice', difficulty: 'hard', category: 'devops', tags: ['生产经验', '面试高频'],
    options: [
      { key: 'A', text: '回滚速度快、发布期间新旧版本不混跑' },
      { key: 'B', text: '资源占用更少' },
      { key: 'C', text: '无需任何额外硬件' },
      { key: 'D', text: '适合有状态数据库' },
    ],
    answer: 'A',
    explanation: '蓝绿部署切换瞬间完成、回滚快，代价是资源翻倍；滚动更新资源省但过程新旧混跑、回滚相对慢。',
    knowledgePoint: '发布策略',
  },

  // ===== 监控与日志 =====
  {
    title: '持续跟踪一个日志文件末尾新增内容的命令是？',
    type: 'single_choice', difficulty: 'easy', category: 'monitoring', tags: ['基础概念'],
    options: [
      { key: 'A', text: 'tail -f' },
      { key: 'B', text: 'head -n 10' },
      { key: 'C', text: 'cat' },
      { key: 'D', text: 'more' },
    ],
    answer: 'A',
    explanation: 'tail -f 持续输出文件尾部新增内容，常用于实时看日志。',
    knowledgePoint: '日志查看',
  },
  {
    title: 'Google SRE 提出的四个黄金监控指标包括？（多选）',
    type: 'multiple_choice', difficulty: 'medium', category: 'monitoring', tags: ['面试高频'],
    options: [
      { key: 'A', text: '延迟（Latency）' },
      { key: 'B', text: '流量（Traffic）' },
      { key: 'C', text: '错误（Errors）' },
      { key: 'D', text: '饱和度（Saturation）' },
    ],
    answer: ['A', 'B', 'C', 'D'],
    explanation: '四大黄金指标：延迟、流量、错误、饱和度，是服务监控的核心。',
    knowledgePoint: '监控指标',
  },
  {
    title: 'Prometheus 采集指标主要采用哪种模式？',
    type: 'single_choice', difficulty: 'medium', category: 'monitoring', tags: ['面试高频'],
    options: [
      { key: 'A', text: '主动拉取（Pull）' },
      { key: 'B', text: '被动接收推送（Push）' },
      { key: 'C', text: '仅靠 Agent 上报日志' },
      { key: 'D', text: '通过 SNMP 轮询' },
    ],
    answer: 'A',
    explanation: 'Prometheus 以 Pull 为主，定期从 exporter 抓取 /metrics；短期批处理任务可用 Pushgateway 推送。',
    knowledgePoint: 'Prometheus',
  },
  {
    title: '如何设计告警规则以避免「告警风暴」？请简述思路。',
    type: 'short_answer', difficulty: 'hard', category: 'monitoring', tags: ['生产经验'],
    answer: '设置告警分级与抑制（高级别抑制低级别）、告警聚合/去重、持续一段时间（for）才触发以减少抖动、合理的阈值与收敛、值班轮转与升级机制、定期复盘收敛无效告警。',
    explanation: '核心是降噪与分级：聚合、去重、抑制、持续时间、告警升级。',
    knowledgePoint: '告警治理',
  },

  // ===== 脚本与自动化 =====
  {
    title: 'Bash 脚本第一行的 shebang 通常写作？',
    type: 'single_choice', difficulty: 'easy', category: 'scripting', tags: ['基础概念'],
    options: [
      { key: 'A', text: '#!/bin/bash' },
      { key: 'B', text: '//bin/bash' },
      { key: 'C', text: '#!bash' },
      { key: 'D', text: '#!/usr/bin/python' },
    ],
    answer: 'A',
    explanation: 'shebang 用 #!/bin/bash 指定解释器；#!/usr/bin/env bash 更可移植。',
    knowledgePoint: 'Shell 基础',
  },
  {
    title: '在 Shell 中引用变量 name 的值，正确写法是？',
    type: 'single_choice', difficulty: 'easy', category: 'scripting', tags: ['基础概念'],
    options: [
      { key: 'A', text: '$name 或 ${name}' },
      { key: 'B', text: '%name%' },
      { key: 'C', text: '#name#' },
      { key: 'D', text: '@name' },
    ],
    answer: 'A',
    explanation: '$name 与 ${name} 都引用变量；${name} 在拼接时边界更清晰，如 ${name}_suffix。',
    knowledgePoint: '变量',
  },
  {
    title: '用于配置 Linux 定时任务的命令是（填写，小写）：',
    type: 'fill_blank', difficulty: 'medium', category: 'scripting', tags: ['基础概念'],
    answer: ['crontab'],
    explanation: 'crontab -e 编辑当前用户定时任务；/etc/crontab 是系统级配置。',
    knowledgePoint: '定时任务',
  },
  {
    title: 'Shell 脚本中 set -e 的作用是？',
    type: 'single_choice', difficulty: 'hard', category: 'scripting', tags: ['生产经验'],
    options: [
      { key: 'A', text: '任何命令返回非零即退出脚本' },
      { key: 'B', text: '开启调试输出' },
      { key: 'C', text: '忽略所有错误' },
      { key: 'D', text: '只执行第一行' },
    ],
    answer: 'A',
    explanation: 'set -e 让脚本在任一命令失败（非零退出）时立即退出，配合 set -u（未定义变量报错）更健壮。',
    knowledgePoint: 'Shell 健壮性',
  },

  // ===== 安全 =====
  {
    title: 'SSH 服务默认监听端口是？',
    type: 'single_choice', difficulty: 'easy', category: 'security', tags: ['基础概念'],
    options: [
      { key: 'A', text: '22' },
      { key: 'B', text: '23' },
      { key: 'C', text: '443' },
      { key: 'D', text: '3389' },
    ],
    answer: 'A',
    explanation: 'SSH 默认 22；Telnet 23；HTTPS 443；RDP 3389。',
    knowledgePoint: '端口',
  },
  {
    title: '生产环境应禁止 root 用户直接通过密码 SSH 登录，改用普通用户 + sudo 或密钥登录。',
    type: 'true_false', difficulty: 'medium', category: 'security', tags: ['生产经验'],
    answer: true,
    explanation: '禁用 root 密码登录（PermitRootLogin no）、用密钥认证，可显著降低暴力破解风险。',
    knowledgePoint: 'SSH 加固',
  },
  {
    title: '以下哪些属于常见的主机安全加固措施？（多选）',
    type: 'multiple_choice', difficulty: 'hard', category: 'security', tags: ['生产经验'],
    options: [
      { key: 'A', text: '关闭不必要的服务与端口' },
      { key: 'B', text: '及时打补丁、升级系统与软件' },
      { key: 'C', text: '最小化权限与最小化安装' },
      { key: 'D', text: '配置防火墙与入侵检测' },
    ],
    answer: ['A', 'B', 'C', 'D'],
    explanation: '缩小攻击面、及时修复漏洞、最小权限、网络防护与检测，都是标准加固动作。',
    knowledgePoint: '安全加固',
  },

  // ===== 计算机 · 基础 =====
  {
    title: 'CPU 的中文全称是？',
    type: 'single_choice', difficulty: 'easy', category: 'cs-basic', tags: ['基础概念'],
    options: [
      { key: 'A', text: '中央处理器' },
      { key: 'B', text: '内存储器' },
      { key: 'C', text: '输入设备' },
      { key: 'D', text: '操作系统' },
    ],
    answer: 'A',
    explanation: 'CPU（Central Processing Unit）即中央处理器，是计算机的运算与控制核心。',
    knowledgePoint: '计算机组成',
  },
  {
    title: '1KB 等于多少字节（Byte）？',
    type: 'single_choice', difficulty: 'easy', category: 'cs-basic', tags: ['基础概念'],
    options: [
      { key: 'A', text: '1000' },
      { key: 'B', text: '1024' },
      { key: 'C', text: '512' },
      { key: 'D', text: '2048' },
    ],
    answer: 'B',
    explanation: '存储容量按二进制换算：1KB = 1024B，1MB = 1024KB。',
    knowledgePoint: '存储单位',
  },
  {
    title: 'RAM（随机存储器）断电后其中的数据不会丢失。',
    type: 'true_false', difficulty: 'easy', category: 'cs-basic', tags: ['基础概念'],
    answer: false,
    explanation: 'RAM 是易失性存储器，断电后数据丢失；ROM 与磁盘等才是非易失性存储。',
    knowledgePoint: '存储器',
  },
  {
    title: 'HTTPS 与 HTTP 相比，最主要的改进是？',
    type: 'single_choice', difficulty: 'easy', category: 'cs-basic', tags: ['面试高频'],
    options: [
      { key: 'A', text: '传输速度更快' },
      { key: 'B', text: '通过 TLS/SSL 对传输内容加密' },
      { key: 'C', text: '支持更多网页格式' },
      { key: 'D', text: '不需要 DNS 解析' },
    ],
    answer: 'B',
    explanation: 'HTTPS 在 HTTP 之下加入 TLS/SSL 层，实现加密传输与身份校验，默认端口 443。',
    knowledgePoint: '网络协议',
  },
  // ===== 计算机 · 编程语言 =====
  {
    title: 'Python 中用于定义函数的关键字是？',
    type: 'single_choice', difficulty: 'easy', category: 'programming', tags: ['基础概念'],
    options: [
      { key: 'A', text: 'function' },
      { key: 'B', text: 'def' },
      { key: 'C', text: 'func' },
      { key: 'D', text: 'define' },
    ],
    answer: 'B',
    explanation: 'Python 使用 def 定义函数；function 是 JavaScript 等语言的关键字。',
    knowledgePoint: 'Python 语法',
  },
  {
    title: 'Java 源代码经编译后生成的是字节码文件（.class）。',
    type: 'true_false', difficulty: 'easy', category: 'programming', tags: ['基础概念'],
    answer: true,
    explanation: 'Java 编译器把源码编译为字节码，由 JVM 解释/即时编译执行，实现"一次编写，到处运行"。',
    knowledgePoint: 'Java 运行机制',
  },
  {
    title: '以下哪些属于强类型语言？（多选）',
    type: 'multiple_choice', difficulty: 'medium', category: 'programming', tags: ['面试高频'],
    options: [
      { key: 'A', text: 'Java' },
      { key: 'B', text: 'Python' },
      { key: 'C', text: 'C' },
      { key: 'D', text: 'JavaScript' },
    ],
    answer: ['A', 'B', 'C'],
    explanation: 'JavaScript 是弱类型语言，隐式类型转换多；Java/Python/C 均为强类型。',
    knowledgePoint: '类型系统',
  },
  // ===== 计算机 · 数据结构与算法 =====
  {
    title: '栈（Stack）的数据操作特点是？',
    type: 'single_choice', difficulty: 'easy', category: 'dsa', tags: ['基础概念', '面试高频'],
    options: [
      { key: 'A', text: '先进先出（FIFO）' },
      { key: 'B', text: '后进先出（LIFO）' },
      { key: 'C', text: '随机存取' },
      { key: 'D', text: '按优先级出队' },
    ],
    answer: 'B',
    explanation: '栈是后进先出结构；队列才是先进先出。',
    knowledgePoint: '栈与队列',
  },

  // ===== 护理 · 基础护理 =====
  {
    title: '成人安静状态下正常的呼吸频率范围是？',
    type: 'single_choice', difficulty: 'easy', category: 'nursing-basic', tags: ['基础概念'],
    options: [
      { key: 'A', text: '8～12 次/分' },
      { key: 'B', text: '16～20 次/分' },
      { key: 'C', text: '24～28 次/分' },
      { key: 'D', text: '30～35 次/分' },
    ],
    answer: 'B',
    explanation: '正常成人安静状态呼吸频率为 16～20 次/分，节律均匀。',
    knowledgePoint: '生命体征观察',
  },
  {
    title: '长期卧床患者压疮最常发生的部位是？',
    type: 'single_choice', difficulty: 'easy', category: 'nursing-basic', tags: ['基础概念', '面试高频'],
    options: [
      { key: 'A', text: '枕后' },
      { key: 'B', text: '肘部' },
      { key: 'C', text: '骶尾部' },
      { key: 'D', text: '足趾' },
    ],
    answer: 'C',
    explanation: '仰卧位时骶尾部承受压力大且缺乏肌肉脂肪保护，是压疮最好发部位。',
    knowledgePoint: '压疮预防',
  },
  {
    title: '使用无菌持物钳时，钳端应始终保持____。',
    type: 'fill_blank', difficulty: 'medium', category: 'nursing-basic', tags: ['基础概念'],
    answer: ['向下', '朝下'],
    explanation: '无菌持物钳使用与存放时钳端均应向下，防止消毒液倒流污染钳端。',
    knowledgePoint: '无菌技术',
  },
  {
    title: '静脉输液中若发现液体不滴，应立即拔针重新穿刺。',
    type: 'true_false', difficulty: 'medium', category: 'nursing-basic', tags: ['故障排查'],
    answer: false,
    explanation: '应先判断原因（针头滑出血管、折叠、压力过低等），针对性处理，盲目拔针增加患者痛苦。',
    knowledgePoint: '静脉输液',
  },
  // ===== 护理 · 内科护理 =====
  {
    title: '糖尿病典型的"三多一少"症状是指？',
    type: 'single_choice', difficulty: 'easy', category: 'nursing-internal', tags: ['面试高频'],
    options: [
      { key: 'A', text: '多饮、多食、多尿、体重减少' },
      { key: 'B', text: '多饮、多睡、多尿、体重增加' },
      { key: 'C', text: '多汗、多食、多便、体重减少' },
      { key: 'D', text: '多饮、多食、多便、乏力' },
    ],
    answer: 'A',
    explanation: '血糖升高引起渗透性利尿（多尿），继而多饮、多食，糖分流失导致体重下降。',
    knowledgePoint: '糖尿病护理',
  },
  {
    title: '测量血压时袖带缠绕过紧，测得的血压值会？',
    type: 'single_choice', difficulty: 'medium', category: 'nursing-internal', tags: ['基础概念'],
    options: [
      { key: 'A', text: '偏高' },
      { key: 'B', text: '偏低' },
      { key: 'C', text: '不变' },
      { key: 'D', text: '先高后低' },
    ],
    answer: 'B',
    explanation: '袖带过紧使血管在未充气前已受压，测得血压偏低；过松则偏高。',
    knowledgePoint: '血压测量',
  },

  // ===== 金融 · 金融基础 =====
  {
    title: '"复利"指的是？',
    type: 'single_choice', difficulty: 'easy', category: 'finance-basic', tags: ['基础概念'],
    options: [
      { key: 'A', text: '只按本金计算利息' },
      { key: 'B', text: '利息并入本金一并计算下期利息' },
      { key: 'C', text: '利息按月固定发放' },
      { key: 'D', text: '本金逐年递减的计息方式' },
    ],
    answer: 'B',
    explanation: '复利即"利滚利"，每期利息计入本金作为下期计息基数；只按本金计息的是单利。',
    knowledgePoint: '利息计算',
  },
  {
    title: '通货膨胀会使货币的购买力下降。',
    type: 'true_false', difficulty: 'easy', category: 'finance-basic', tags: ['基础概念'],
    answer: true,
    explanation: '通货膨胀意味着物价水平上涨，单位货币能购买的商品减少，即购买力下降。',
    knowledgePoint: '宏观经济',
  },
];

async function main() {
  getDb();

  // 分类：先建行业一级分类，再挂子分类
  const catIdBySlug = new Map<string, string>();
  const insertCategory = (c: SeedCategory, sortOrder: number) => {
    const existing = get<{ id: string }>('SELECT id FROM categories WHERE slug = ?', c.slug);
    if (existing) {
      catIdBySlug.set(c.slug, existing.id);
      return;
    }
    const id = uid();
    const parentId = c.parent ? (catIdBySlug.get(c.parent) ?? null) : null;
    run(
      'INSERT INTO categories (id, name, slug, parent_id, sort_order) VALUES (?, ?, ?, ?, ?)',
      id, c.name, c.slug, parentId, sortOrder,
    );
    catIdBySlug.set(c.slug, id);
  };
  for (const ind of INDUSTRIES) insertCategory(ind, catIdBySlug.size);
  for (const c of CATEGORIES) insertCategory(c, catIdBySlug.size);

  // 标签
  const tagIdByName = new Map<string, string>();
  for (const t of TAGS) {
    const existing = get<{ id: string }>('SELECT id FROM tags WHERE name = ?', t);
    if (existing) tagIdByName.set(t, existing.id);
    else {
      const id = uid();
      run('INSERT INTO tags (id, name) VALUES (?, ?)', id, t);
      tagIdByName.set(t, id);
    }
  }

  // 题目（幂等：按题干去重）
  let created = 0;
  for (const q of QUESTIONS) {
    const existing = get<{ id: string }>('SELECT id FROM questions WHERE title = ?', q.title);
    if (existing) continue;
    const id = uid();
    run(
      `INSERT INTO questions (id, title, type, difficulty, category_id, options, answer, explanation, knowledge_point, source, is_public)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      id,
      q.title,
      q.type,
      q.difficulty,
      catIdBySlug.get(q.category) ?? null,
      q.options ? JSON.stringify(q.options) : null,
      JSON.stringify(q.answer),
      q.explanation ?? null,
      q.knowledgePoint ?? null,
      q.source ?? null,
    );
    for (const t of q.tags) {
      const tid = tagIdByName.get(t);
      if (tid) run('INSERT OR IGNORE INTO question_tags (question_id, tag_id) VALUES (?, ?)', id, tid);
    }
    created++;
  }

  // 默认账号
  const ensureUser = (email: string, username: string, password: string, role: string) => {
    const existing = get<{ id: string }>('SELECT id FROM users WHERE email = ?', email);
    if (existing) return;
    run(
      'INSERT INTO users (id, email, username, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      uid(),
      email,
      username,
      hashPassword(password),
      role,
    );
  };
  ensureUser('admin@ops.local', 'admin', 'admin123', 'ADMIN');
  ensureUser('demo@ops.local', 'demo', 'demo123', 'USER');

  console.log(`[seed] 完成：分类 ${CATEGORIES.length} 个、标签 ${TAGS.length} 个、新增题目 ${created} 道`);
  console.log('[seed] 默认账号：admin / admin123（管理员）；demo / demo123（普通用户）');
}

// 仅直接执行（pnpm run seed）时运行；被迁移脚本 import 数据时无副作用
const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((e) => {
    console.error('[seed] 失败', e);
    process.exit(1);
  });
}

// 供迁移脚本复用
export { INDUSTRIES, CATEGORIES, TAGS, QUESTIONS, main as seedMain };
